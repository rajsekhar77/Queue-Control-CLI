#!/usr/bin/env node
// src/worker.js
import { exec } from "child_process";
import { randomUUID } from "crypto";
import { logger } from "./logger.js";
import { config } from "./config.js";
import {
  claimJob,
  completeJob,
  failJobAndScheduleRetry,
  moveToDlq
} from "./jobManager.js";
import { computeBackoffDelay } from "./utils/backoff.js";

/**
 * Worker Pool
 * Runs N parallel worker loops that continuously poll for new jobs.
 */
export async function startWorkerPool({ workers = 1 } = {}) {
  logger.info(`🚀 Starting worker pool with ${workers} worker(s)`);

  let shuttingDown = false;
  const workerId = randomUUID().slice(0, 8);
  const activeWorkers = new Set();

  // Graceful shutdown handler
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn("🛑 Received shutdown signal, finishing active jobs...");
    // Wait for all active jobs to complete
    await Promise.allSettled([...activeWorkers]);
    logger.info("✅ All workers stopped gracefully.");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const workerLoop = async (index) => {
    const name = `worker-${index}`;
    logger.info(`${name} started.`);

    while (!shuttingDown) {
      try {
        // Try to claim one job atomically
        const job = claimJob(workerId);

        if (!job) {
          // No pending jobs → sleep for poll interval
          await sleep(config.WORKER_POLL_INTERVAL_MS);
          continue;
        }

        logger.info(`${name} claimed job ${job.id}: ${job.command}`);
        await processJob(job, name);
      } catch (err) {
        logger.error(`💥 ${name} loop error: ${err.message}`);
      }
    }

    logger.info(`${name} exiting...`);
  };

  // Launch N workers concurrently
  for (let i = 0; i < workers; i++) {
    const promise = workerLoop(i + 1);
    activeWorkers.add(promise);
  }
}

/**
 * Executes a job command using child_process.exec().
 * Handles success, retries, and DLQ movement.
 */
async function processJob(job, workerName) {
  return new Promise((resolve) => {
    logger.info(`${workerName} ▶️ Executing job ${job.id}: ${job.command}`);

    const startTime = Date.now();
    const child = exec(job.command, { timeout: 30000 }, (error, stdout, stderr) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (!error) {
        completeJob(job.id, { stdout, stderr });
        logger.info(`${workerName} ✅ Job ${job.id} completed successfully in ${duration}s`);
        return resolve();
      }

      const lastError = error.message || "Unknown error";
      const attempts = job.attempts + 1;
      const maxRetries = job.max_retries;

      logger.warn(`${workerName} ❌ Job ${job.id} failed (attempt ${attempts}/${maxRetries}): ${lastError}`);

      if (attempts >= maxRetries) {
        moveToDlq(job.id, lastError);
        logger.error(`${workerName} 💀 Job ${job.id} moved to DLQ after ${attempts} attempts`);
        return resolve();
      }

      // Compute exponential backoff
      const delaySeconds = computeBackoffDelay(attempts);
      failJobAndScheduleRetry(job.id, lastError, delaySeconds);

      logger.info(
        `${workerName} 🔁 Retrying job ${job.id} in ${delaySeconds}s (attempt ${attempts}/${maxRetries})`
      );
      resolve();
    });

    child.stdout?.on("data", (data) => process.stdout.write(`[${workerName}] ${data}`));
    child.stderr?.on("data", (data) => process.stderr.write(`[${workerName} ERROR] ${data}`));
  });
}

/** Sleep helper */ 
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
