#!/usr/bin/env bash
set -e

echo "🚀 Starting queuectl end-to-end test"
echo "==================================="
echo

# Step 1: Setup
echo "🧱 Resetting data directory..."
rm -rf ./data
mkdir -p ./data

# Step 2: Enqueue jobs
echo "📝 Enqueueing jobs..."
node ./src/cli.js enqueue "echo 'Job A successful'"
node ./src/cli.js enqueue "ls -l"
node ./src/cli.js enqueue "cat missingfile.txt" --max-retries=2

# Step 3: Show queue status
echo
echo "📊 Queue status before running workers:"
node ./src/cli.js status

# Step 4: Run worker pool (auto-retries + DLQ)
echo
echo "⚙️  Running workers (this will take a few seconds)..."
node ./src/cli.js run --workers=2

# Step 5: Show queue + DLQ
echo
echo "📊 Queue status after processing:"
node ./src/cli.js status

echo
echo "💀 Listing DLQ:"
node ./src/cli.js dlq list

# Step 6: Purge DLQ
echo
echo "🧹 Purging DLQ..."
printf "y\n" | node ./src/cli.js dlq purge

echo
echo "✅ Final queue status:"
node ./src/cli.js status

echo
echo "🎉 Test complete! All features working."
