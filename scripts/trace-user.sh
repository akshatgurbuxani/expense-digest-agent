#!/usr/bin/env bash
# Trace all logs for a specific userId from worker logs
# Usage:
#   ./scripts/trace-user.sh <userId>
#   ./scripts/trace-user.sh usr_abc123
#   npm run trace -- usr_abc123

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <userId>"
  echo "Example: $0 usr_abc123"
  exit 1
fi

USER_ID="$1"

echo "🔍 Tracing logs for userId: $USER_ID"
echo ""

# If log file exists, grep it
if [ -f "worker.log" ]; then
  echo "📋 From worker.log:"
  grep "\"userId\":\"$USER_ID\"" worker.log | jq -r '[.time, .level, .jobType // "—", .msg] | @tsv' | column -t -s$'\t'
else
  echo "⚠️  No worker.log found. Make sure workers are running with LOG_PRETTY=false and redirected to worker.log"
  echo ""
  echo "To capture logs:"
  echo "  npm run dev:workers > worker.log 2>&1"
fi

# If API log exists
if [ -f "api.log" ]; then
  echo ""
  echo "📋 From api.log:"
  grep "\"userId\":\"$USER_ID\"" api.log | jq -r '[.time, .level, .msg] | @tsv' | column -t -s$'\t'
fi

echo ""
echo "✅ Done"
