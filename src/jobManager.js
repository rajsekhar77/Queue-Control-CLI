// src/jobManager.js
import { getDb, initDb } from "./storage.js";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Enqueue a shell command as a job.
 * Returns the job id.
 */
export function enqueueJob({ command, max_retries = config.DEFAULT_MAX_RETRIES }) {
  const db = getDb();
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);

  const stmt = db.prepare(`
    INSERT INTO jobs (id, command, max_retries, state, created_at, updated_at, next_run_at)
    VALUES (@id, @command, @max_retries, 'pending', @now, @now, @now)
  `);

  stmt.run({
    id,
    command,
    max_retries,
    now
  });

  logger.info(`Enqueued job ${id}: ${command}`);
  return id;
}

/**
 * Fetch pending jobs eligible to run (next_run_at <= now) limit 1.
 * Note: This is a basic fetch; claiming/locking should be done with an atomic UPDATE in worker logic.
 */
export function getPendingJobs(limit = 10) {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const rows = db.prepare(`
    SELECT * FROM jobs
    WHERE state = 'pending' AND next_run_at <= @now
    ORDER BY created_at ASC
    LIMIT @limit
  `).all({ now, limit });
  return rows;
}

/**
 * Utility to move a job to DLQ.
 */
export function moveToDlq(job, reason = "max retries exceeded") {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO dlq (id, command, attempts, last_error, moved_at, original_created_at)
    VALUES (@id, @command, @attempts, @last_error, @moved_at, @original_created_at)
  `);
  const del = db.prepare(`DELETE FROM jobs WHERE id = @id`);

  const now = Math.floor(Date.now() / 1000);
  const info = insert.run({
    id: job.id,
    command: job.command,
    attempts: job.attempts,
    last_error: reason,
    moved_at: now,
    original_created_at: job.created_at
  });

  del.run({ id: job.id });

  logger.warn(`Job ${job.id} moved to DLQ: ${reason}`);
}

/**
 * Basic job state updater
 */
export function updateJobState(id, fields = {}) {
  const db = getDb();
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
  const stmt = db.prepare(sql);
  return stmt.run(params);
}
