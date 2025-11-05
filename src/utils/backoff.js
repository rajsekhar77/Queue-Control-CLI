// src/utils/backoff.js
import { config } from "../config.js";

/**
 * Exponential backoff formula:
 * delay = base ^ attempts
 */
export function computeBackoffDelay(attempts) {
  return Math.pow(config.BACKOFF_BASE, attempts);
}
