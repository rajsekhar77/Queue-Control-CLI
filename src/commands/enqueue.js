// src/commands/enqueue.js
import { logger } from "../logger.js";
import { enqueueJob } from "../jobManager.js";

/**
 * Enqueue command handler.
 * Validates user input and enqueues a new job.
 */
export function handleEnqueue(commandParts, options = {}) {
  try {
    if (!commandParts || commandParts.length === 0) {
      console.error("❌  Error: No command provided.\nUsage: queuectl enqueue \"<shell_command>\"");
      process.exitCode = 1;
      return;
    }

    const command = commandParts.join(" ").trim();
    if (command.length === 0) {
      console.error("❌  Error: Empty command.");
      process.exitCode = 1;
      return;
    }

    const maxRetries = Number(options.maxRetries ?? 3);
    if (isNaN(maxRetries) || maxRetries < 0) {
      console.error("❌  Error: Invalid --max-retries value. Must be a number >= 0.");
      process.exitCode = 1;
      return;
    }

    const jobId = enqueueJob({ command, max_retries: maxRetries });

    logger.info(`Job created: ${jobId}`);
    console.log(`✅  Job enqueued successfully!`);
    console.log(`🆔  Job ID: ${jobId}`);
    console.log(`💻  Command: ${command}`);
    console.log(`🔁  Max Retries: ${maxRetries}`);
  } catch (err) {
    logger.error(`Failed to enqueue job: ${err.stack || err.message}`);
    console.error(`❌  Failed to enqueue job: ${err.message}`);
    process.exitCode = 1;
  }
}
