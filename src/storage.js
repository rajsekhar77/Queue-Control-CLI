// src/storage.js
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import { logger } from "./logger.js";

let db = null;

/**
 * Initialize (or open) the SQLite DB and create schema if not exists.
 * This uses synchronous better-sqlite3 APIs (simpler for CLI tools).
 */
export function initDb() {
  if (db) return db;

  // ensure data dir exists
  try {
    if (!fs.existsSync(config.DB_DIR)) {
      fs.mkdirSync(config.DB_DIR, { recursive: true });
      logger.info(`Created DB directory: ${config.DB_DIR}`);
    }
  } catch (err) {
    logger.error(`Failed to ensure DB directory: ${err.message}`);
    throw err;
  }

  db = new Database(config.DB_PATH, { verbose: null });
  logger.info(`Opened DB at ${config.DB_PATH}`);

  // Create jobs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',  -- pending, in_progress, completed, failed
      attempts INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT ${config.DEFAULT_MAX_RETRIES},
      next_run_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      locked_at INTEGER,
      locked_by TEXT,
      stdout TEXT,
      stderr TEXT,
      last_error TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);

  // Create DLQ table
  db.exec(`
    CREATE TABLE IF NOT EXISTS dlq (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      last_error TEXT,
      moved_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      original_created_at INTEGER
    );
  `);

  // Index for selecting pending jobs faster
  db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_state_nextrun ON jobs (state, next_run_at);`);

  return db;
}

/**
 * Expose simple helper to get DB instance
 */
export function getDb() {
  if (!db) initDb();
  return db;
}

/* -------------------------------
   Storage API
   ------------------------------- */

/**
 * Insert a job into jobs table.
 * job: { id, command, max_retries, next_run_at (optional, unix seconds) }
 */
export function insertJob({ id, command, max_retries = config.DEFAULT_MAX_RETRIES, next_run_at = null }) {
  const database = getDb();
  const now = Math.floor(Date.now() / 1000);
  const nr = next_run_at ?? now;
  const stmt = database.prepare(`
    INSERT INTO jobs (id, command, max_retries, state, attempts, next_run_at, created_at, updated_at)
    VALUES (@id, @command, @max_retries, 'pending', 0, @next_run_at, @now, @now)
  `);
  stmt.run({
    id,
    command,
    max_retries,
    next_run_at: nr,
    now
  });
  return id;
}

/**
 * Fetch pending jobs eligible to run (next_run_at <= now).
 * This is a read-only snapshot: claiming should be done via claimJob.
 */
export function fetchPendingJobs(limit = 10) {
  const database = getDb();
  const now = Math.floor(Date.now() / 1000);
  const rows = database.prepare(`
    SELECT * FROM jobs
    WHERE state = 'pending' AND next_run_at <= @now
    ORDER BY created_at ASC
    LIMIT @limit
  `).all({ now, limit });
  return rows;
}

/**
 * Atomically claim a single pending job for a worker.
 * Returns the claimed job object, or null if none available.
 *
 * Claim logic:
 * - select oldest job with state='pending' and next_run_at <= now
 * - update it to state='processing', set locked_at and locked_by only if it is still pending
 * - return the updated row
 */
export function claimJobForWorker(workerId) {
  const database = getDb();
  const now = Math.floor(Date.now() / 1000);
  // compute lock expiration threshold to allow re-claiming stale locks (not used here for pending jobs,
  // but included for completeness if we extend to re-claim processing jobs)
  const lockTimeoutSec = Math.floor(config.LOCK_TIMEOUT_MS / 1000);
  const expiredAt = now - lockTimeoutSec;

  const tx = database.transaction((wid) => {
    // find candidate job
    const row = database.prepare(`
      SELECT * FROM jobs
      WHERE state = 'pending' AND next_run_at <= @now
      ORDER BY created_at ASC
      LIMIT 1
    `).get({ now });

    if (!row) return null;

    // try to claim it (safe because within transaction)
    const res = database.prepare(`
      UPDATE jobs
      SET state = 'processing',
          locked_at = @now,
          locked_by = @workerId,
          updated_at = @now
      WHERE id = @id AND state = 'pending'
    `).run({ now, workerId: wid, id: row.id });

    if (res.changes !== 1) {
      // Someone else claimed it concurrently
      return null;
    }

    // return the newly-claimed row
    const claimed = database.prepare(`SELECT * FROM jobs WHERE id = @id`).get({ id: row.id });
    return claimed;
  });

  return tx(workerId);
}

/**
 * Get job by id
 */
export function getJobById(id) {
  const database = getDb();
  return database.prepare(`SELECT * FROM jobs WHERE id = @id`).get({ id });
}

/**
 * Update job fields (partial)
 * fields: object mapping column -> value
 */
export function updateJobFields(id, fields = {}) {
  if (!id) throw new Error("id required");
  const database = getDb();
  const sets = [];
  const params = { id };
  let idx = 0;
  for (const [k, v] of Object.entries(fields)) {
    idx++;
    sets.push(`${k} = @v${idx}`);
    params[`v${idx}`] = v;
  }
  if (sets.length === 0) return;
  // updated_at
  sets.push(`updated_at = @updated_at`);
  params.updated_at = Math.floor(Date.now() / 1000);

  const sql = `UPDATE jobs SET ${sets.join(", ")} WHERE id = @id`;
  const stmt = database.prepare(sql);
  return stmt.run(params);
}

/**
 * Increment attempts, record last_error, and schedule next_run_at
 * nextRunDelaySeconds: integer seconds to delay before next attempt
 * Returns updated job row.
 */
export function incrementAttemptsAndSchedule(id, lastError = null, nextRunDelaySeconds = 0) {
  const database = getDb();
  const now = Math.floor(Date.now() / 1000);
  const nextRunAt = now + Math.max(0, Math.floor(nextRunDelaySeconds));

  const tx = database.transaction((jobId) => {
    database.prepare(`
      UPDATE jobs
      SET attempts = attempts + 1,
          last_error = @last_error,
          next_run_at = @next_run_at,
          state = 'pending',
          locked_at = NULL,
          locked_by = NULL,
          updated_at = @now
      WHERE id = @id
    `).run({
      last_error: lastError,
      next_run_at: nextRunAt,
      now,
      id: jobId
    });

    return database.prepare(`SELECT * FROM jobs WHERE id = @id`).get({ id: jobId });
  });

  return tx(id);
}

/**
 * Move a job to DLQ (atomic transfer)
 * reason: string
 */
export function moveJobToDlq(id, reason = "moved to dlq") {
  const database = getDb();
  const now = Math.floor(Date.now() / 1000);

  const tx = database.transaction((jobId) => {
    const job = database.prepare(`SELECT * FROM jobs WHERE id = @id`).get({ id: jobId });
    if (!job) return null;

    database.prepare(`
      INSERT OR REPLACE INTO dlq (id, command, attempts, last_error, moved_at, original_created_at)
      VALUES (@id, @command, @attempts, @last_error, @moved_at, @original_created_at)
    `).run({
      id: job.id,
      command: job.command,
      attempts: job.attempts,
      last_error: reason ?? job.last_error,
      moved_at: now,
      original_created_at: job.created_at
    });

    database.prepare(`DELETE FROM jobs WHERE id = @id`).run({ id: jobId });

    return { id: jobId };
  });

  return tx(id);
}

/**
 * DLQ helpers
 */
export function listDlq(limit = 100) {
  const database = getDb();
  return database.prepare(`SELECT * FROM dlq ORDER BY moved_at DESC LIMIT @limit`).all({ limit });
}

export function purgeDlq() {
  const database = getDb();
  const res = database.prepare(`DELETE FROM dlq`).run();
  return res;
}
