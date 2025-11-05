// src/commands/dlq.js
import readline from "readline";
import { listDlq, purgeDlq } from "../jobManager.js";
import { logger } from "../logger.js";

/**
 * Show list of DLQ jobs
 */
export function handleDlqList() {
  const rows = listDlq(100);
  console.log("\n🧾 Dead Letter Queue (up to 100 entries):");
  if (rows.length === 0) {
    console.log("✅ DLQ is empty.\n");
    return;
  }

  for (const job of rows) {
    console.log(`• ID: ${job.id}`);
    console.log(`  Command: ${job.command}`);
    console.log(`  Attempts: ${job.attempts}`);
    console.log(`  Last Error: ${job.last_error || "N/A"}`);
    console.log(`  Moved At: ${new Date(job.moved_at * 1000).toLocaleString()}`);
    console.log("");
  }
}

/**
 * Purge all DLQ entries (with confirmation)
 */
export function handleDlqPurge() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("⚠️  Are you sure you want to purge all DLQ entries? (y/N): ", (answer) => {
    rl.close();
    if (answer.toLowerCase() !== "y") {
      console.log("🛑  Aborted. DLQ not purged.");
      return;
    }

    const result = purgeDlq();
    logger.warn(`💀 Purged ${result.changes} DLQ entries`);
    console.log(`✅  Purged ${result.changes} DLQ entries successfully.`);
  });
}
