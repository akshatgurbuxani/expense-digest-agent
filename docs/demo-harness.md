# Demo harness

Offline and live ways to demonstrate Gmail receipt enrichment.

## Replay mode (investor-safe, no API keys)

Runs every entry in `RECEIPT_PIPELINE_SCENARIOS` through the in-memory mail
pipeline harness, builds digest facts, and writes HTML artifacts:

```bash
npm run demo:replay
```

Options:

```bash
npm run demo:replay -- --scenario amazon-happy-path
npm run demo:replay -- --scenario amazon-happy-path,amount-mismatch-no-link
npm run demo:replay -- --output ./demo-output
```

Output layout:

```
demo-output/
  index.html              # scenario index — open in a browser
  amazon-happy-path/
    summary.json          # pipeline + digest fact counts
    digest.txt            # fake-LLM weekly digest prose
    digest.html           # rendered email preview
  ...
```

**Use for:** investor walkthroughs, design reviews, regression snapshots. Fully
deterministic; runs in a few seconds with no Docker, Gmail, Plaid, or Claude.

Implementation: `scripts/demo-receipt-pipeline.ts` reuses
`runReceiptPipelineScenario()` from `@expense/core/testing`.

## Live sandbox (T8)

Runs the real worker stack against Gmail sandbox (and optionally Plaid sandbox +
Claude). **Not for CI** — requires credentials and network access.

### Prerequisites

1. Copy `.env.example` → `.env` and set:
   - `DEMO_LIVE=1` (safety gate)
   - `GMAIL_INTEGRATION=true`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `GMAIL_TEST_REFRESH_TOKEN` — OAuth refresh token for a test Gmail account
   - `GMAIL_TEST_ADDRESS` — same account's email address
2. Optional Plaid matching: `PLAID_CLIENT_ID`, `PLAID_SECRET`, pass `--with-plaid`
3. Optional real extraction: `ANTHROPIC_API_KEY` and `LLM_FAKE=false`

### Run

```bash
DEMO_LIVE=1 npm run demo:live
```

Options:

```bash
# Incremental sync (mail.sync) instead of 30-day backfill (mail.fullSync)
DEMO_LIVE=1 npm run demo:live -- --incremental

# Inject a Plaid sandbox charge, sync transactions, then Gmail backfill
DEMO_LIVE=1 npm run demo:live -- --with-plaid --charge-amount 45.99 --charge-merchant Amazon

# Custom output directory
DEMO_LIVE=1 npm run demo:live -- --output ./demo-output/live-run
```

Output: `demo-output/live/live-report.json` with message counts, receipt/link
summary, and per-message processing status.

Implementation: `scripts/demo-receipt-live.ts` uses `buildWorkerContainer` +
`registerJobHandlers` with in-memory repos (same wiring as e2e tests).

## CI vs demo

| Command | What runs |
|---------|-----------|
| `npm test` | Unit + component (320+ tests) |
| `npm run test:integration` | E2e slices including `gmail-to-digest.e2e.ts` |
| `npm run demo:replay` | Human/demo artifacts only — not in CI |
| `npm run demo:live` | Live Gmail sandbox demo — not in CI; requires `DEMO_LIVE=1` |
