#!/usr/bin/env node
import { Command } from "commander";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { initDb } from "./storage.js";
import { handleEnqueue } from "./commands/enqueue.js";
import { startWorkerPool } from "./worker.js";
import { handleDlqList, handleDlqPurge } from "./commands/dlq.js";
import { handleStatus } from "./commands/status.js";

const program = new Command();

program
  .name(config.APP_NAME)
  .description("queuectl — a lightweight CLI-based background job queue")
  .version("0.1.0");

program
  .option("--db-path <path>", "path to sqlite db file", config.DB_PATH)
  .hook("preAction", (thisCommand, actionCommand) => {
    // initialize DB and logger
    initDb();
    logger.info(`Running command: ${thisCommand.name()} ${actionCommand.name()}`);
  });

// --- ENQUEUE COMMAND ---
program
  .command("enqueue <command...>")
  .description("Enqueue a shell command to run as a job (wrap the command in quotes).")
  .option("--max-retries <n>", "maximum retries for this job", String(config.DEFAULT_MAX_RETRIES))
  .action((commandParts, opts) => {
    handleEnqueue(commandParts, opts)
  });

// --- RUN COMMAND ---
program
  .command("run")
  .description("Run workers to process jobs in parallel.")
  .option("--workers <n>", "Number of concurrent workers", "1")
  .action(async (opts) => {
    const workers = Number(opts.workers || 1);
    await startWorkerPool({ workers });
  });

// --- STATUS COMMAND ---
program
  .command("status")
  .description("Show basic queue status (pending jobs).")
  .action(() => handleStatus());

// --- DLQ COMMAND (placeholder) ---
const dlq = program
  .command("dlq")
  .description("DLQ management (list, purge) — coming soon.");

dlq
  .command("list")
  .description("List jobs currently in the DLQ")
  .action(() => handleDlqList());

dlq
  .command("purge")
  .description("Delete all DLQ entries (with confirmation)")
  .action(() => handleDlqPurge());

// --- CONFIG COMMAND ---
program
  .command("config")
  .description("Show effective configuration")
  .action(() => {
    console.log("\n⚙️  Current Configuration\n---------------------------");
    for (const [key, val] of Object.entries(config)) {
      console.log(`${key.padEnd(25)} : ${val}`);
    }
    console.log("");
  });

program.parseAsync(process.argv).catch(err => {
  logger.error(err.stack || err.message || String(err));
  process.exit(1);
});
