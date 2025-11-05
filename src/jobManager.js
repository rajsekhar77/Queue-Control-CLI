// src/jobManager.js
import * as storage from "./storage.js";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Enqueue a shell command as a job.
 * Returns the job id.
 */
export function enqueueJob({ command, max_retries = config.DEFAULT_MAX_RETRIES, next_run_at = null }) {
  const id = uuidv4();
  storage.insertJob({ id, command, max_retries, next_run_at });
  logger.info(`Enqueued job ${id}: ${command}`);
  return id;
}

/**
 * Get pending jobs (snapshot)
 */
export function getPendingJobs(limit = 10) {
  return storage.fetchPendingJobs(limit);
}

/**
 * Claim a job for a workerId (atomic)
 */
export function claimJob(workerId) {
  return storage.claimJobForWorker(workerId);
}

/**
 * Mark job as completed, include stdout/stderr if available
 */
export function completeJob(id, { stdout = null, stderr = null } = {}) {
  storage.updateJobFields(id, { state: "completed", stdout, stderr });
  logger.info(`Job ${id} completed`);
}

/**
 * Handle failure: increment attempts, compute next_run_at externally
 * The worker will compute delaySeconds and call this.
 */
export function failJobAndScheduleRetry(id, lastError = "", delaySeconds = 0) {
  const updated = storage.incrementAttemptsAndSchedule(id, lastError, delaySeconds);
  logger.info(`Job ${id} scheduled for retry in ${delaySeconds}s`);
  return updated;
}

/**
 * Move to DLQ (storage will delete from jobs)
 */
export function moveToDlq(id, reason = "max retries exceeded") {
  storage.moveJobToDlq(id, reason);
  logger.warn(`Job ${id} moved to DLQ: ${reason}`);
}

/**
 * Expose DLQ helpers
 */
export function listDlq(limit = 100) {
  return storage.listDlq(limit);
}

export function purgeDlq() {
  return storage.purgeDlq();
}
