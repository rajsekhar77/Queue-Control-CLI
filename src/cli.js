#!/usr/bin/env node
import { Command } from "commander";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { initDb } from "./storage.js";
import { enqueueJob, getPendingJobs } from "./jobManager.js";

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

program
  .command("enqueue <command...>")
  .description("Enqueue a shell command to run as a job (wrap the command in quotes).")
  .option("--max-retries <n>", "maximum retries for this job", String(config.DEFAULT_MAX_RETRIES))
  .action((commandParts, opts) => {
    const command = commandParts.join(" ");
    const maxRetries = Number(opts.maxRetries ?? config.DEFAULT_MAX_RETRIES);
    const id = enqueueJob({ command, max_retries: maxRetries });
    console.log(`Enqueued job ${id}`);
  });

program
  .command("run")
  .description("Run workers to process jobs (stub in Step 1).")
  .option("--workers <n>", "number of worker loops to start", "1")
  .action((opts) => {
    const workers = Number(opts.workers || 1);
    console.log(`run command invoked (stub). workers=${workers}`);
    console.log("Worker implementation coming in Step 4.");
  });

program
  .command("status")
  .description("Show basic queue status (stub).")
  .action(() => {
    const rows = getPendingJobs(5);
    console.log("Pending jobs (up to 5):");
    for (const r of rows) {
      console.log(`- ${r.id} | ${r.command} | attempts=${r.attempts} | next_run_at=${new Date(r.next_run_at * 1000).toISOString()}`);
    }
  });

program
  .command("dlq")
  .description("DLQ management (list, purge) — coming soon.")
  .action(() => {
    console.log("dlq commands coming in Step 6.");
  });

program
  .command("config")
  .description("Show effective configuration")
  .action(() => {
    console.log("Config:");
    console.log(JSON.stringify(config, null, 2));
  });

program.parseAsync(process.argv).catch(err => {
  logger.error(err.stack || err.message || String(err));
  process.exit(1);
});
