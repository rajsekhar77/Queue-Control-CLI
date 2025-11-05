// src/commands/status.js
import { getDb } from "../storage.js";
import { logger } from "../logger.js";

/**
 * Display job queue summary
 */
export function handleStatus() {
  const db = getDb();

  const stats = {
    total: db.prepare("SELECT COUNT(*) AS c FROM jobs").get().c,
    pending: db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE state='pending'").get().c,
    processing: db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE state='processing'").get().c,
    completed: db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE state='completed'").get().c,
    dlq: db.prepare("SELECT COUNT(*) AS c FROM dlq").get().c,
  };

  const table = [
    ["📦 Total Jobs ", stats.total], 
    ["⏳ Pending    ", stats.pending],
    ["⚙️  Processing", stats.processing],
    ["✅ Completed  ", stats.completed],
    ["💀 DLQ        ", stats.dlq],
  ];

  console.log("\n📊 Queue Status Overview\n------------------------");
  for (const [label, count] of table) {
    console.log(`${label.padEnd(20)} : ${count}`);
  }
  console.log("");

  logger.info("Displayed queue status summary");
}
