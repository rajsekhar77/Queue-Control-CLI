// src/config.js
import dotenv from "dotenv";
import path from "path";
import os from "os";

// Load .env if present
dotenv.config();

const DEFAULT_DB_DIR = path.resolve(process.cwd(), "data");
const DEFAULT_DB_PATH = path.join(DEFAULT_DB_DIR, "queue.db");

export const config = {
  DB_DIR: process.env.QUEUECTL_DB_DIR || DEFAULT_DB_DIR,
  DB_PATH: process.env.QUEUECTL_DB_PATH || DEFAULT_DB_PATH,
  LOG_LEVEL: process.env.QUEUECTL_LOG_LEVEL || "info",
  DEFAULT_MAX_RETRIES: Number(process.env.QUEUECTL_MAX_RETRIES ?? 3),
  BACKOFF_BASE: Number(process.env.QUEUECTL_BACKOFF_BASE ?? 2),
  WORKER_POLL_INTERVAL_MS: Number(process.env.QUEUECTL_POLL_INTERVAL_MS ?? 2000),
  LOCK_TIMEOUT_MS: Number(process.env.QUEUECTL_LOCK_TIMEOUT_MS ?? 60_000),
  APP_NAME: "queuectl",
};
