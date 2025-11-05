# queuectl

`queuectl` — a CLI-based background job queue system built in Node.js.

This repository will be developed incrementally. This is the **Step 1** snapshot: project skeleton, base CLI, config, SQLite setup, and logger.

## ✅ Features implemented so far (Step 1)
- Project skeleton and package.json (ESM)
- CLI implemented with `commander` and commands:
  - `enqueue` (basic)
  - `run` (stub)
  - `status` (basic)
  - `dlq` (placeholder)
  - `config`
- Centralized configuration (`src/config.js`)
- Winston-based logger (`src/logger.js`)
- SQLite DB initialization & schema creation (`src/storage.js`)
- Job manager stubs (`src/jobManager.js`) with `enqueueJob`, `getPendingJobs`, `updateJobState`, `moveToDlq`.

## 🛠️ Setup

1. Clone the repo and enter folder:
   ```bash
   git clone <repo-url> queuectl
   cd queuectl
