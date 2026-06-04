# Code Map

The file-by-file layout of every package and app. This is the literal build
checklist: when we implement, we create these files in
[build order](./expense-digest-architecture.md#build-order), and each file's
job is already specified by the docs it links to. Nothing here should require a
new decision — only typing.

Workspace tooling: **npm workspaces + TypeScript project references**. Each
package/app has its own `package.json` and `tsconfig.json` extending
`tsconfig.base.json`. Packages export TypeScript source directly (run via
`tsx` in dev, type-checked with `tsc -b`).

```
/
├── package.json                # workspaces, root scripts (typecheck, test, dev:*)
├── tsconfig.base.json          # shared compiler options
├── tsconfig.json               # project references → every package/app
├── docker-compose.yml          # Postgres + Redis
├── .env.example                # every env var, documented
├── docs/                       # ← these documents
├── config/                     # default.yaml + {NODE_ENV}.yaml tunables
├── test-scenarios/             # YAML e2e scenario files
├── scripts/                    # utility scripts (demo, token minting, tracing)
├── demo-output/                # generated demo artifacts
├── packages/
└── apps/
```

Legend: each file lists its **one job** and the **doc** that specifies it.

---

## `packages/core` — domain + ports (depends on nothing)

The heart. No vendor import, no other workspace package.

```
packages/core/src/
├── money.ts                  # Money value object                    → conventions §1
├── ids.ts                    # branded ids + newId() (uuidv7)         → conventions §2
├── errors.ts                 # AppError + 5 concrete errors           → error-handling
├── registry.ts               # generic Registry<K,V>                  → registries
├── domain/
│   ├── user.ts               # User, Weekday, DeliveryPreference      → domain-model
│   ├── item.ts               # Item, ItemStatus                       → domain-model
│   ├── account.ts            # Account                                → domain-model
│   ├── transaction.ts        # Transaction                            → domain-model
│   ├── category.ts           # CATEGORIES, Category                   → domain-model
│   ├── digest.ts             # Digest, DigestFacts, TrendFact         → domain-model
│   ├── monthly-report.ts     # MonthlyReport                          → domain-model
│   ├── monthly-report-facts.ts # MonthlyReportFacts                     → domain-model
│   ├── anomaly.ts            # Anomaly, AnomalyReason, Severity        → domain-model
│   ├── baseline.ts           # SpendBaseline, MerchantSignals         → domain-model
│   ├── receipt-kind.ts       # ReceiptKind, exclusion helpers         → gmail-receipt-enrichment §5.4
│   ├── mail-account.ts       # MailAccount                              → gmail-receipt-enrichment §5.2
│   ├── mail-message.ts       # MailMessage, MailProcessingStatus        → gmail-receipt-enrichment §5.3
│   ├── receipt.ts            # Receipt, ReceiptLineItem                 → gmail-receipt-enrichment §5.5
│   ├── transaction-receipt-link.ts  # TransactionReceiptLink            → gmail-receipt-enrichment §5.6
│   └── unmatched-receipt.ts  # UnmatchReason, UnmatchedReceiptFact      → gmail-receipt-enrichment §5.7
├── mail-classifiers.ts       # receipt email classifiers (pure)         → gmail-receipt-enrichment §7
├── receipt-match-scorer.ts   # score receipt ↔ transaction              → gmail-receipt-enrichment §7
├── unmatch-reasons.ts        # unmatched fact builders + copy           → gmail-receipt-enrichment §5.7
├── ports/
│   ├── clock.ts  logger.ts  crypto.ts                                 → interfaces
│   ├── bank-provider.ts      # BankProvider, SyncPage, RawTransaction → interfaces
│   ├── mail-provider.ts      # MailProvider, RawMailMetadata          → gmail-receipt-enrichment §6.1
│   ├── receipt-extractor.ts  # ReceiptExtractor                         → gmail-receipt-enrichment §6.2
│   ├── llm-provider.ts       # LlmProvider, MerchantEnrichment        → interfaces
│   ├── delivery.ts           # DeliveryChannel, DeliveryRouter        → interfaces
│   ├── job-producer.ts       # JobProducer, JobConsumer (no BullMQ!)  → interfaces
│   └── repositories.ts       # all repository ports (+ mail/receipt)   → interfaces
├── services/                 # PURE domain logic, fed only ports
│   ├── sync-service.ts       # cursor paging loop, upsert, enqueue    → architecture §3
│   ├── categorize-service.ts # runs the resolver chain                → registries §4
│   ├── category-resolvers.ts # plaidPfc / cache / llm resolvers       → registries §4
│   ├── anomaly-service.ts    # runs detector registry                 → registries §3
│   ├── anomaly-detectors.ts  # the 4 pure detectors                   → registries §3
│   ├── baseline-service.ts   # recompute a user's rolling stats        → architecture §Baselines
│   ├── digest-service.ts     # compute facts → LLM → validate → store → architecture §7
│   ├── digest-facts.ts       # PURE: txns+baselines → DigestFacts     → domain-model
│   ├── monthly-report-facts.ts  # PURE: month window → MonthlyReportFacts → gmail-receipt-enrichment §9
│   ├── receipt-enrichment-facts.ts  # matched/unmatched/missing receipt sections → gmail-receipt-enrichment §9
│   ├── receipt-enrichment-load.ts   # load receipts + links for facts builders
│   ├── report-schedule.ts    # isDueForMonthlyReport, previousYearMonth → gmail-receipt-enrichment §9
│   ├── monthly-report-contract.ts  # assertNoInventedMonthlyReportNumbers → testing
│   ├── money-contract.ts     # assertNoInventedNumbers()              → testing
│   ├── baseline-math.ts      # PURE: rolling mean/median/stddev       → domain-model
│   ├── window.ts             # PURE: weekWindowFor, monthWindowFromYearMonth → conventions §3
│   ├── delivery-service.ts   # build OutboundMessage, route, record   → architecture §8
│   ├── mail-sync-service.ts  # history.list incremental sync          → gmail-receipt-enrichment §6
│   ├── mail-full-sync-service.ts  # backfill on history 404           → gmail-receipt-enrichment §6
│   ├── mail-watch-service.ts # renew users.watch                      → gmail-receipt-enrichment §6
│   ├── receipt-parse-service.ts   # classify + extract + store Receipt → gmail-receipt-enrichment §7
│   ├── receipt-match-service.ts   # score + link receipt ↔ transaction → gmail-receipt-enrichment §7
│   ├── report-service.ts     # monthly facts → LLM → store → delivery → gmail-receipt-enrichment §9
│   └── scheduler-service.ts  # digest + mail.watch + report.generate ticks → architecture §9
└── testing/                  # fakes — importable by every package
    ├── fixed-clock.ts  fake-llm.ts  fake-bank.ts
    ├── fake-mail.ts             # makeFakeMailProvider()
    ├── fake-receipt-extractor.ts
    ├── mail-pipeline.harness.ts # makeMailPipelineHarness() — L2 mail job chain
    ├── receipt-scenarios.ts     # RECEIPT_PIPELINE_SCENARIOS catalog (data-only)
    ├── receipt-scenario-runner.ts  # runReceiptPipelineScenario()
    ├── in-memory-repos.ts  capturing-channel.ts  capturing-jobs.ts
    ├── in-memory-queue.ts      # FakeJobProducer + FakeJobConsumer
    ├── null-logger.ts          # makeNullLogger() — silent for tests
    ├── tunables.ts             # scenario tuning defaults
    ├── e2e-scenario-schema.ts  # Zod schema for YAML scenario files
    ├── e2e-harness.ts          # loadE2EScenario, seedFromScenario, expandScenario
    └── contracts/              # mail-provider, receipt-extractor, mail-repos
```

> The single most important property: this package builds and tests with
> **zero** external services. Everything above `services/` is pure or
> port-driven.

---

## `packages/config` — env, logger, clock, crypto

```
packages/config/src/
├── env.ts           # Zod schema for all env vars; parse once; typed Env  → conventions §4
├── logger.ts        # makeLogger(env): Logger  (pino adapter)             → interfaces
├── clock.ts         # makeSystemClock(): Clock                            → interfaces
├── crypto.ts        # makeCrypto(key): Crypto  (AES-256-GCM)              → interfaces
├── jwt.ts           # makeJwtService() — shared JWT mint/verify            → security
├── auth-token.ts    # makeAuthTokenService() — session JWTs for web
├── mcp-token.ts     # makeMcpTokenService() — per-user MCP tokens
├── app-config.ts    # AppConfig Zod schema for YAML tunables
├── load-config.ts   # loadConfig() — layered YAML loader
├── merge.ts         # deep-merge for environment overlays
├── mappers.ts       # config → domain type mappers
├── index.ts         # barrel export
└── testing/
    └── index.ts     # makeTestEnv(), makeTestAppConfig() — sub-path export
```

---

## `packages/db` — Prisma + repository adapters

Implements the repository ports. The only package that imports
`@prisma/client`.

```
packages/db/
├── prisma/schema.prisma      # tables from architecture §Data Model; user_id indexed everywhere
└── src/
    ├── client.ts             # makePrisma(url): PrismaClient (one pool)
    ├── mappers.ts            # row ⇄ domain type (Money ⇄ minor_units+currency)
    ├── repositories.ts       # makeRepositories(prisma, crypto) → all ports
    ├── user-repo.ts  item-repo.ts  transaction-repo.ts
    ├── mail-account-repo.ts  mail-message-repo.ts  receipt-repo.ts
    ├── transaction-receipt-link-repo.ts
    ├── merchant-category-repo.ts  baseline-repo.ts
    └── digest-repo.ts  anomaly-repo.ts  report-repo.ts
```

Contract reminders baked into these files: every method takes `userId` and adds
`where userId`; `item-repo.withAccessToken` decrypts only inside the callback;
`transaction-repo.upsertMany` dedupes on `plaid_transaction_id`. → [interfaces](./interfaces.md#repository-ports)

---

## `packages/queue` — typed jobs + BullMQ adapter

The only package that imports `bullmq`.

```
packages/queue/src/
├── jobs.ts            # JOB_SCHEMAS map → JobName, JobPayload<K>        → registries §1
├── producer.ts        # makeJobProducer(redisUrl): JobProducer; validates + jobId idempotency
├── consumer.ts        # makeJobConsumer(redisUrl): JobConsumer; the runHandler wrapper → error-handling §1
├── dead-letter.ts     # moveToDeadLetter() + DLQ queues + alert hook
└── connection.ts      # shared ioredis connection factory
```

---

## `packages/wiring` — shared composition builders

Assembles adapters into domain services. Used by every app's composition root.

```
packages/wiring/src/
├── types.ts                   # shared types for container options
├── resolve-config.ts          # YAML tunables loader
├── resolve-repos.ts           # makeRepositories
├── resolve-bank.ts            # makeBankProvider (Plaid or fake)
├── resolve-llm.ts             # makeLlmProvider (Claude or fake)
├── resolve-mail.ts            # makeMailProvider (Gmail or fake)
├── resolve-receipt-extractor.ts  # makeReceiptExtractor (Claude or fake)
├── resolve-delivery.ts        # makeDeliveryRouter + channels
├── resolve-producer.ts        # makeJobProducer (BullMQ or in-memory)
├── resolve-worker-queue.ts    # makeJobConsumer + graceful shutdown
├── build-services.ts          # assembles all domain services from repos + ports
└── index.ts                   # barrel export
```

---

## `packages/plaid` — BankProvider adapter

```
packages/plaid/src/
├── plaid-bank-provider.ts  # makeBankProvider(cfg): BankProvider       → interfaces
├── webhook-verify.ts       # JWT verification, key cache               → interfaces / security
└── mappers.ts              # Plaid txn → RawTransaction; amount→Money
```

---

## `packages/gmail` — MailProvider adapter

Implements Gmail OAuth, sync, watch, and Pub/Sub push decode.

```
packages/gmail/src/
├── config.ts              # GmailConfig, hasGmailCredentials
├── gmail-mail-provider.ts # makeGmailMailProvider(cfg)
├── mime-walk.ts           # multipart MIME → text/plain + text/html
├── push-verify.ts         # Pub/Sub JWT + Base64URL payload decode
├── oauth-state.ts         # signed OAuth state (userId in callback)
├── address.ts             # from → domain extraction helpers
├── mappers.ts             # Gmail API → RawMailMetadata
├── errors.ts              # 404 → MailHistoryExpiredError, mapGmailHttpError
├── index.ts               # barrel export
└── testing/
    └── ...                # test helpers
```

OAuth routes live in `apps/api/src/routes/gmail.ts`. Wiring: `resolveMail()`.

---

## `packages/llm` — LlmProvider + receipt extractor + fake

```
packages/llm/src/
├── claude-llm-provider.ts      # makeClaudeLlm(cfg): LlmProvider; bounded concurrency
├── claude-receipt-extractor.ts # makeClaudeReceiptExtractor(): ReceiptExtractor
├── fake-llm-provider.ts        # makeFakeLlm(): LlmProvider (re-exported for prod LLM_FAKE)
├── receipt-amount-validate.ts  # parse validation for extracted totals
├── prompts/
│   ├── categorize.ts           # prompt builder + response Zod schema (Category enum-locked)
│   ├── digest.ts               # prompt from DigestFacts; "do not invent numbers"
│   ├── monthly-report.ts       # prompt from MonthlyReportFacts
│   └── receipt.ts              # receipt extraction prompt + schema
└── concurrency.ts              # small limiter                              → conventions §9
```

---

## `packages/delivery` — channels + router

```
packages/delivery/src/
├── email-channel.ts   # makeEmailChannel(cfg): DeliveryChannel (Resend, kind="email")
├── sms-channel.ts     # makeSmsChannel(cfg): DeliveryChannel  (Twilio, kind="sms")
├── dry-run-channel.ts # makeDryRunChannel(log): logs instead of sends
├── router.ts          # makeDeliveryRouter(channels): DeliveryRouter   → registries §2
└── templates/
    ├── digest.html.ts        # DigestFacts/prose → HTML  (no arithmetic here)
    ├── monthly-report.html.ts  # MonthlyReportFacts/prose → HTML
    └── anomaly.text.ts       # anomaly → SMS text
```

---

## `apps/api` — REST + webhook receiver + composition root

```
apps/api/src/
├── composition-root.ts # buildContainer(env)                           → factories
├── create-app.ts       # Express app factory (middleware stack, route mount)
├── main.ts             # create-app + listen
├── middleware/
│   ├── auth.ts         # authenticate → req.userId                     → security
│   ├── auth-factory.ts # makeContainerAuthMiddleware(container)        → security
│   └── error.ts        # AppError → HTTP status                        → error-handling §2
├── routes/
│   ├── webhooks.ts     # POST /webhooks/plaid + /webhooks/gmail       → architecture §1
│   ├── plaid-link.ts   # create link token, exchange public token
│   ├── gmail.ts        # GET /api/gmail/authorize, /callback, /connect
│   ├── auth.ts         # POST /api/auth/token (dev-only)
│   ├── setup.ts        # GET /api/setup/status
│   ├── preferences.ts  # GET/PUT user prefs (digest day/time, tz, channel)
│   └── digests.ts      # GET digest history (tenant-scoped)
└── mcp-token.ts        # mint short-lived per-user MCP token            → security / MCP
```

The webhook route must read the **raw body** for signature verification —
mount `express.raw()` on that route only, before `express.json()`.

---

## `apps/workers` — the BullMQ workers

```
apps/workers/src/
├── composition-root.ts # buildContainer(env) (workers flavor)          → factories
├── job-handlers.ts     # registerJobHandlers(consumer, services) — 12 handlers
└── main.ts             # load config → build container → register handlers → start
```

Workers hold **no logic** — each handler forwards to a domain service in
`core`. Add a worker = add one handler + the service in `core`.

---

## `apps/scheduler` — per-user digest scheduler

```
apps/scheduler/src/
├── composition-root.ts
└── main.ts   # every minute: users.findDueForDigest(clock.now())
           #   → enqueue digest.generate with jobId digest:{userId}:{isoWeek} → architecture §6
```

Idempotent by `jobId`; safe to run multiple instances.

---

## `apps/mcp-server` — tenant-scoped finance tools

```
apps/mcp-server/src/
├── composition-root.ts # buildMcpContainer() — Prisma repos, auth, server
├── auth.ts             # resolveMcpUserId() — verify token → UserId
├── create-server.ts    # createMcpServer(deps) — register tools on MCP server
├── main.ts             # StdioServerTransport → connect
└── tools/
    ├── types.ts                # McpToolDeps
    ├── spending-helpers.ts     # shared window query logic
    ├── get-spending-this-week.ts   compare-to-last-month.ts
    ├── get-spending-by-category.ts list-recent-anomalies.ts
    ├── get-digest-history.ts
    └── index.ts                # barrel
```

Each tool is a thin wrapper over the same tenant-scoped repositories the API
uses; no tool can read across tenants. → [architecture §10](./expense-digest-architecture.md#10-mcp-server)

---

## `apps/web` — React frontend

```
apps/web/src/
├── App.tsx                    # setup gate → prefs + digest history
├── api.ts                     # REST client (setup, plaid, gmail, prefs, digests)
└── components/
    ├── SetupGate.tsx          # blocks dashboard until bank + Gmail connected
    ├── ConnectBankButton.tsx  # Plaid Link
    ├── ConnectGmailButton.tsx # OAuth authorize redirect
    ├── PreferencesForm.tsx
    └── DigestHistoryList.tsx
```

Built after the backend loop; onboarding requires both Plaid and Gmail per
[gmail-receipt-enrichment.md §2](./gmail-receipt-enrichment.md).

---

## Build order ↔ files

Following [the architecture build order](./expense-digest-architecture.md#build-order),
each step maps to a slice of this map:

| Step | Files |
|------|-------|
| 1 | `docker-compose.yml`, `.env.example`, root tsconfig/package.json |
| 2 | all of `packages/core` (types + ports first, services next) |
| 3 | `packages/config` |
| 4 | `packages/db` (schema + repos) |
| 5 | `packages/queue` |
| 6 | `packages/plaid` |
| 7 | `packages/wiring` |
| 8 | `apps/api` (webhook + link) |
| 9 | `apps/workers` (sync, then categorize) + `core` services |
| 10 | `packages/llm` (+ resolver chain in `core`) |
| 11 | `core/digest-*` + `apps/workers` digest |
| 12 | `packages/delivery` + delivery worker |
| 13 | `apps/scheduler` |
| 14 | `apps/mcp-server` |
| later | packages/gmail, anomaly detectors throughout, then `apps/web` |

When we start building, we build top-to-bottom within each package: **types →
ports → pure functions → services → adapter → wiring → test**. By the time we
reach wiring, everything it needs already exists and is already tested.
