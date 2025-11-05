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
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. CLI usage examples

- Show help:

  ```bash
  queuectl --help
  ```

- Enqueue a job (example):

  ```bash
  queuectl enqueue "echo 'Hello world'" --max-retries=3
  ```

- Show configuration:

  ```bash
  queuectl config
  ```

- Show pending jobs (basic preview):

  ```bash
  queuectl status
  ```

## Database / Persistence (Step 2)

`queuectl` persists job state to a local SQLite database (default location: `./data/queue.db`, configurable via `.env`).

### Schema (essential columns)

#### `jobs`

- `id` TEXT PRIMARY KEY — UUID assigned to the job.
- `command` TEXT — Shell command to run.
- `state` TEXT — `pending` or `processing`.
- `attempts` INTEGER — Number of times attempted.
- `max_retries` INTEGER — Max allowed retries before DLQ.
- `next_run_at` INTEGER — UNIX seconds when job becomes eligible.
- `locked_at` INTEGER — UNIX seconds when job was locked by worker.
- `locked_by` TEXT — Worker id that claimed the job.
- `stdout`, `stderr`, `last_error` TEXT — execution outputs & errors.
- `created_at`, `updated_at` INTEGER — timestamps.

#### `dlq`

- `id`, `command`, `attempts`, `last_error`, `moved_at`, `original_created_at`

### Persistence guarantees

- Writes are performed to SQLite using `better-sqlite3`. The DB is created automatically on first run.
- Key operations (claiming a job, moving to DLQ) use SQLite transactions for atomicity.
- Jobs persist across restarts — stop and start the `queuectl run` worker and pending jobs will remain.

### Developer notes

- `src/storage.js` exposes:
  - `insertJob({ id, command, max_retries, next_run_at })`
  - `fetchPendingJobs(limit)`
  - `claimJobForWorker(workerId)`
  - `incrementAttemptsAndSchedule(id, lastError, nextRunDelaySeconds)`
  - `moveJobToDlq(id, reason)`
  - `listDlq(limit)` and `purgeDlq()`

These will be used by the job manager and worker implementations in subsequent steps.

## Worker Pool (Step 4)

Run workers to process queued jobs.

```bash
queuectl run --workers=3
```

## Retry Logic (Step 5)

When a job fails, it is **retried automatically** using an exponential backoff strategy.

### Formula

delay = BACKOFF_BASE \*\* attempts

For example, if `BACKOFF_BASE=2` and the job failed 3 times:

- Retry 1 → after 2 seconds
- Retry 2 → after 4 seconds
- Retry 3 → after 8 seconds

After the maximum retries (`max_retries`) are exceeded, the job is moved to the **DLQ**.

### Environment variables controlling retry

| Variable                | Description              | Default |
| ----------------------- | ------------------------ | ------- |
| `QUEUECTL_BACKOFF_BASE` | Exponential backoff base | 2       |
| `QUEUECTL_MAX_RETRIES`  | Default max retries      | 3       |

### Retry Flow Diagram

```text
      ┌─────────────┐
      │Enqueued Job │
      └──────┬──────┘
             │
             ▼
       (worker claims)
             │
             ▼
      ┌──────────────┐
      │ Execute Job  │
      └──────┬───────┘
             │
             ▼
  ┌─────────────────────┐
  │    Job succeeded?   │
  └───┬─────────────┬───┘
      │             │
  Yes ▼             ▼ No
┌─────────┐   ┌───────────────┐
│Completed│   │Increment retry│
└─────────┘   └───────┬───────┘
                      │
             attempts < max_retries ?
                      │
                      ▼
              ┌─────────────────┐
              │  Yes → schedule │
              │  next_run_at    │
              │(delay = base^n) │
              └───────┬─────────┘
                      │
                      ▼
              ┌──────────────────┐
              │ No → Move to DLQ │
              └──────────────────┘
```
