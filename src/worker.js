#!/usr/bin/env node
// src/worker.js
import { logger } from "./logger.js";

/**
 * Worker implementation will be added in Step 4.
 * For now: export a starter function signature.
 */
export async function startWorkerPool({ workers = 1, stopSignal = null } = {}) {
  logger.info(`Worker pool starting (stub) with workers=${workers}`);
  // Real implementation will poll DB, claim jobs, exec child_process, handle locks, retries.
  return {
    stop: async () => {
      logger.info("Worker pool stop called (stub)");
    }
  };
}
