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
      state TEXT NOT NULL DEFAULT 'pending',
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
