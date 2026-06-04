# Production Logging Guide

This system uses **structured logging** with correlation IDs to trace requests through the pipeline. Every log line is JSON in production, human-readable in development.

---

## Philosophy

- **Structured, not templated**: Pass data as fields, not interpolated into messages
- **Correlation IDs**: Every job log includes `userId`, `jobType`, `jobId`
- **Levels are meaningful**:
  - `debug`: Detailed flow (data loaded, facts computed)
  - `info`: Key milestones (job started, completed, digest generated)
  - `warn`: Recoverable issues (retry scheduled, fallback used)
  - `error`: Failures (job exhausted, validation failed)

---

## Configuration

Set in `.env`:

```bash
LOG_LEVEL=info           # debug | info | warn | error
LOG_PRETTY=true          # Human-readable (dev); false for JSON (prod)
SERVICE_NAME=expense-api # Optional: for log aggregation
```

---

## Development (Human-Readable)

With `LOG_PRETTY=true`:

```
10:23:45.123 INFO  [usr_abc123] [digest.generate:digest:usr_abc123:2026-W22] digest generation started
10:23:45.234 DEBUG [usr_abc123] [digest.generate:digest:usr_abc123:2026-W22] data loaded
10:23:45.456 INFO  [usr_abc123] [digest.generate:digest:usr_abc123:2026-W22] calling LLM for digest prose
10:23:46.789 INFO  [usr_abc123] [digest.generate:digest:usr_abc123:2026-W22] digest generation completed
```

---

## Production (JSON Lines)

With `LOG_PRETTY=false`:

```json
{"level":30,"time":"2026-06-02T10:23:45.123Z","env":"production","service":"expense-workers","userId":"usr_abc123","jobType":"digest.generate","jobId":"digest:usr_abc123:2026-W22","msg":"digest generation started"}
{"level":30,"time":"2026-06-02T10:23:46.789Z","env":"production","service":"expense-workers","userId":"usr_abc123","jobType":"digest.generate","jobId":"digest:usr_abc123:2026-W22","durationMs":1666,"msg":"digest generation completed"}
```

These JSON lines are ready for:
- **Datadog**: Send via Vector/Fluentd
- **CloudWatch Logs**: Stream with Lambda/ECS log driver
- **Elasticsearch**: Ingest with Filebeat
- **Grafana Loki**: Query with LogQL

---

## Correlation IDs

Every worker job automatically logs with:

| Field | Meaning | Example |
|-------|---------|---------|
| `userId` | Tenant scope | `usr_abc123` |
| `jobType` | Job name | `digest.generate` |
| `jobId` | Unique job instance | `digest:usr_abc123:2026-W22` |
| `attempt` | Retry count | `1`, `2`, `3` |

Services create scoped loggers:

```ts
const log = deps.log.child({ userId, digestId });
log.info("digest persisted", { totalSpend: facts.totalSpend });
```

---

## Tracing a User

**Local dev** (live tail):

```bash
npm run dev:workers | grep usr_abc123
```

**From log files**:

```bash
# Trace all activity for a user
./scripts/trace-user.sh usr_abc123

# Or manually:
grep '"userId":"usr_abc123"' worker.log | jq -r '[.time, .jobType, .msg] | @tsv'
```

**Production** (depends on your log aggregation):

```bash
# Datadog
datadog-query 'service:expense-workers userId:usr_abc123'

# CloudWatch Logs Insights
fields @timestamp, jobType, msg | filter userId = "usr_abc123" | sort @timestamp

# Loki / Grafana
{service="expense-workers"} |= "usr_abc123" | json
```

---

## Tracing a Digest

Find all logs for a specific digest generation:

```bash
# By jobId
grep '"jobId":"digest:usr_abc123:2026-W22"' worker.log | jq .

# By digestId (after job completes)
grep '"digestId":"dgs_xyz789"' worker.log | jq .
```

---

## What Gets Logged

### Job Lifecycle (automatic)

Every job logs:
- `job started` (info)
- `job completed` (info) with `durationMs`
- `job failed` (error) if thrown

### Service-Level Logs

#### `syncService`
- `sync started` (info) — cursor position
- `sync page received` (debug) — added/modified/removed counts per page
- `sync completed` (info) — total stats, final cursor

#### `digestService`
- `digest generation started` (info)
- `data loaded` (debug) — txn/baseline/anomaly counts
- `facts computed` (debug) — total spend, categories, maturity
- `calling LLM for digest prose` (info)
- `money contract validated` (debug)
- `digest persisted` (debug) — digestId, subject
- `digest generation completed` (info) — digestId, total spend

#### `categorizeService`
- `categorization started` (info)
- `cache hit` (debug) / `cache miss, calling LLM` (info)
- `categorization completed` (info) — merchant name, category

#### `deliveryService`
- `delivery started` (info) — kind (digest/anomaly), channel
- `delivery sent` (info) — channel result
- `delivery failed` (error) — retry details

---

## Error Logging

Errors include:
- `errorCode`: e.g., `"upstream"`, `"validation"`, `"not_found"`
- `errorMessage`: Human-readable error
- `retryable`: `true` if job will retry
- `attempt` / `maxAttempts`: Retry state

Example:

```json
{
  "level": 50,
  "time": "2026-06-02T10:23:45.123Z",
  "userId": "usr_abc123",
  "jobType": "txn.categorize",
  "jobId": "categorize-abc-123",
  "errorCode": "upstream",
  "errorMessage": "Anthropic API rate limit exceeded",
  "retryable": true,
  "attempt": 1,
  "maxAttempts": 5,
  "msg": "job execution error"
}
```

---

## Monitoring Queries

### Key metrics to track:

**Job success rate**:
```
count(msg="job completed") / (count(msg="job completed") + count(msg="job failed"))
```

**P95 job duration**:
```
percentile(durationMs, 95) where msg="job completed" group by jobType
```

**Error rate by type**:
```
count(level="error") group by errorCode
```

**DLQ entries** (jobs exhausted retries):
```
count(msg="job exhausted retries, moving to DLQ")
```

---

## Production Recommendations

### 1. Log Aggregation

Ship logs to a centralized system:

- **Datadog**: Best for correlation, alerting, and APM integration
- **CloudWatch Logs**: Native AWS, good for Lambda/ECS
- **Elasticsearch + Kibana**: Self-hosted, powerful querying
- **Grafana Loki**: Lightweight, cost-effective

### 2. Alerts

Set up alerts for:
- Error rate > threshold (e.g., 5% over 5min)
- DLQ entries > 0
- Job duration P95 > threshold (e.g., digest > 10s)
- `msg="money contract validation failed"` (critical!)

### 3. Log Retention

- **Hot storage** (queryable): 7-30 days
- **Cold storage** (archive): 90-365 days for compliance

### 4. Sampling (if needed)

If log volume becomes expensive, sample `debug` level:
- Keep 100% of `error` and `warn`
- Keep 100% of `info` for job lifecycle
- Sample `debug` at 10% or only for flagged users

### 5. Sensitive Data

**Already handled**: Plaid access tokens are never logged (accessed only via `withAccessToken` callback). 

**Watch for**: Don't log full transaction descriptions or email content — log IDs and counts only.

---

## Free Tier Options

If you're not ready for paid log aggregation:

1. **Grafana Loki** (self-hosted, free)
   - Deploy on a $5 DigitalOcean droplet
   - Query with LogQL in Grafana
   
2. **Local file rotation** with `pino-pretty`
   - Use `logrotate` to compress old logs
   - Grep/jq for manual investigation

3. **CloudWatch Logs** (AWS Free Tier)
   - 5GB ingestion, 5GB storage per month free
   - Pay-as-you-go after that (~$0.50/GB)

---

## Examples

### Trace a digest generation end-to-end

```bash
# Start workers with JSON logging
LOG_PRETTY=false npm run dev:workers > worker.log 2>&1 &

# Trigger a digest
curl -X POST http://localhost:3000/api/digests/trigger

# Trace it
grep '"jobType":"digest.generate"' worker.log | jq '.time, .msg, .durationMs'
```

### Find slow digests

```bash
# Find digests that took > 5 seconds
jq 'select(.jobType == "digest.generate" and .msg == "job completed" and .durationMs > 5000) | {userId, durationMs}' worker.log
```

### Find all errors for a user

```bash
jq 'select(.userId == "usr_abc123" and .level >= 50)' worker.log
```

---

## Special case: the MCP server logs to stderr

The MCP server (`apps/mcp-server`) communicates over **stdio** (the MCP
transport). Logging to stdout would corrupt the JSON-RPC message stream, so it
uses `makeStderrLogger()` instead of `makeLogger()` — same interface, same
structured output, but to stderr. Tests and other processes use the stdout
`makeLogger()` as normal.

---

## Summary

✅ **Structured JSON** in production for log aggregation  
✅ **Human-readable** in dev for quick debugging  
✅ **Correlation IDs** (userId, jobType, jobId) on every line  
✅ **Meaningful levels** (debug/info/warn/error)  
✅ **Duration tracking** for every job  
✅ **Error context** (code, retryable, attempt)  
✅ **Traceable** with simple grep/jq or your log aggregator  

Your logs are **production-ready** with zero external dependencies required.
