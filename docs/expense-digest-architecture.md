# Expense Digest Agent — Architecture

---

## The Problem

People have no real picture of where their money goes. Bank apps dump raw
transactions on you — "AMZN MKTP US 4829" — with no narrative, no patterns,
no proactive intelligence. You check when you remember, which means you never
check. End of month is always a surprise.

The specific pains worth solving:

- No proactive delivery — you have to go looking, so you never do
- Raw transactions carry no meaning on their own
- No pattern recognition across weeks and months
- Anomalies (price increases, duplicate charges) go completely unnoticed
- Even if you look, nothing tells you what to actually do about it

---

## Goal

A backend system that connects to users' bank accounts, understands their
transactions intelligently, and delivers a human-readable weekly digest
without requiring any manual action from the user.

The digest should read like a message from someone who knows your finances,
not a spreadsheet export.

This is designed as a backend you could drop into a larger product. Every
external dependency sits behind an interface, every unit of work flows
through a typed contract, and nothing in the domain knows or cares which
vendor is on the other side. It is multi-tenant from the first line of code.

---

## What This Is Not

This is not a budgeting app. We are not building Mint or YNAB. There is no
manual categorization, no budget goal-setting UI, no charts dashboard as the
core product. The core product is the digest itself: a smart, automatic,
narrative summary delivered to you on a schedule. Everything else is
infrastructure to support that.

---

## Design Principles

These are the rules the rest of the document obeys. When a decision is
ambiguous, these break the tie.

**Ports and adapters.** The domain depends on interfaces (ports), never on
vendors. Plaid, Claude, Resend, Twilio, Postgres, and Redis are adapters that
implement those ports. Swapping Resend for Postmark, or Claude for another
model, is a one-file change in `@expense/wiring` (or the relevant resolver) and
touches no business logic. This is what makes the system integratable into a
larger product.

**Multi-tenant by construction.** Every row, every job, every query is scoped
to a `userId`. There is no global state that assumes a single user. Tenant
isolation is enforced at the data-access layer, not left to callers to
remember.

**Async by default, decoupled by queues.** Nothing on the critical path
blocks. Ingress accepts an event, persists intent, and returns. All real work
happens in workers communicating through typed job contracts. Producers never
call consumers directly — they emit events and move on (the "callback"
boundary in this system is the queue: a worker subscribes to a job type and is
invoked when one arrives).

**Money is computed, never generated.** All figures — totals, averages,
deltas, anomaly thresholds — are computed deterministically in code. The LLM
receives finished numbers and is only allowed to write prose around them. The
model never does arithmetic and never sees a reason to invent a figure.

**Honest about what needs an LLM.** Scheduling is a cron. Routing is a switch
statement. Anomaly thresholds are statistics. The LLM is used in exactly two
places where it earns its cost: resolving messy merchant names and writing the
narrative. Everywhere else, deterministic code is cheaper, faster, and more
trustworthy.

**Single responsibility.** Each component does one thing. The webhook receiver
does not process. The categorization worker does not deliver. The delivery
service does not generate content.

**Fail gracefully, never silently.** Jobs retry with backoff. Exhausted jobs
land in a dead-letter queue and page a human. A delivery failure does not lose
a digest; a worker crash does not lose a transaction.

**No premature optimization.** No Kafka, no microservices with separate
databases, no sharding. BullMQ over Redis and a single Postgres are genuinely
sufficient for the target scale and dramatically simpler to operate.

---

## High-Level System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                            INGESTION                               │
│                                                                   │
│  Plaid Webhook ─► Webhook Receiver (Express)                      │
│  (SYNC_UPDATES_      verifies JWT signature, looks up item,       │
│   AVAILABLE, etc.)   enqueues sync job, returns 200 in <50ms      │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                           QUEUE LAYER                              │
│                        BullMQ over Redis                          │
│                                                                   │
│  txn.sync   txn.categorize   digest.generate   delivery.send      │
│  anomaly.evaluate            (all typed contracts, DLQ on each)   │
└──────┬───────────┬───────────────┬──────────────────┬─────────────┘
       │           │               │                  │
       ▼           ▼               ▼                  ▼
┌────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Sync       │ │ Categorize   │ │ Digest       │ │ Delivery     │
│ Worker     │ │ Worker       │ │ Worker       │ │ Worker       │
│            │ │              │ │              │ │              │
│ pulls via  │ │ PFC → cache  │ │ computes all │ │ routes to    │
│ /txns/sync │ │ → LLM on     │ │ figures,     │ │ channel by   │
│ cursor,    │ │ miss; flags  │ │ LLM writes   │ │ user pref;   │
│ upserts    │ │ anomaly      │ │ prose only   │ │ email/SMS    │
│ added/mod/ │ │ candidates   │ │              │ │              │
│ removed    │ │              │ │              │ │              │
└─────┬──────┘ └──────┬───────┘ └──────┬───────┘ └──────────────┘
      │               │                │
      └───────────────┼────────────────┘
                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                          STORAGE LAYER                            │
│                           PostgreSQL                              │
│                                                                  │
│  users │ plaid_items │ accounts │ transactions │ digests │       │
│  anomalies │ merchant_categories (learned cache) │ spend_baselines│
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                          SCHEDULING                               │
│  Digest Scheduler — scans every minute for users whose local      │
│  digest time is due, enqueues digest.generate with a              │
│  deterministic jobId (digest:{userId}:{isoWeek}) for idempotency  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                          INTERFACE LAYER                          │
│  REST API (Express, authenticated)  ─►  Frontend (React)          │
│  MCP Server (per-user scoped tokens) ─►  Claude queries finances  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Core Abstractions (Ports)

These interfaces are the spine of the system. The domain layer is written
entirely against them; adapters implement them. This is the section that makes
"decoupled, interfaces, callbacks, swappable" concrete.

**`BankProvider`** — everything we need from a bank-data vendor.

```
createLinkToken(userId)             -> linkToken
exchangePublicToken(publicToken)    -> { itemId, accessToken }
syncTransactions(item, cursor)      -> { added, modified, removed, nextCursor, hasMore }
verifyWebhook(headers, rawBody)     -> VerifiedWebhook | throws
```

The Plaid adapter implements this. The domain never imports the Plaid SDK.

**`LlmProvider`** — the only two LLM jobs in the system.

```
categorizeMerchant(rawName, context) -> { merchantName, category, signals }
writeDigest(facts: DigestFacts)      -> { subject, body }   // prose only, never numbers
```

`DigestFacts` is a fully-computed, deterministic struct. A `FakeLlmProvider`
implements the same interface for tests and local dev with no API key.

**`DeliveryChannel`** — one method, many implementations.

```
send(recipient, message) -> DeliveryResult
```

`EmailChannel` (Resend) and `SmsChannel` (Twilio) implement it. A
`DeliveryRouter` selects a channel from the user's preference; adding push
notifications later means adding one adapter and one registration (the router
is a keyed registry, not a switch).

**`Queue` / `JobProducer`** — typed publish/subscribe over BullMQ.

```
enqueue(jobType, payload, opts)   // producer side
process(jobType, handler)         // consumer side — the callback boundary
```

Every job type has a payload schema validated at the boundary.

**Repository ports** — `UserRepository`, `TransactionRepository`,
`DigestRepository`, `AnomalyRepository`, `ItemRepository`,
`MerchantCategoryRepository`, `BaselineRepository`. The Prisma client lives
behind these; domain services receive repositories, not a database handle, and
tenant scoping is enforced inside them.

**Cross-cutting ports** — `Clock` (testable time), `Logger` (structured),
`Crypto` (encrypt/decrypt secrets at rest). Injected, never imported as
singletons.

Everything is wired together in **composition roots** — one thin builder per
runnable process (`buildApiContainer`, `buildWorkerContainer`,
`buildSchedulerContainer`). Shared assembly logic lives in
`packages/wiring`; each app imports only the adapters its process actually
uses. That is the only place that knows which concrete adapter implements
which port.

---

## Component Breakdown

### 1. Webhook Receiver

Plaid fires a webhook when transactions are available, an item needs
attention, or an account updates. The receiver's only job: verify the Plaid
JWT signature against Plaid's rotating keys, resolve the `item_id` to a tenant,
enqueue a `txn.sync` job, and return 200 in under 50ms.

It does not call the LLM, does not write transactions, and does not trust the
payload to contain the data. Plaid webhooks are notifications, not data — so
the receiver records "this item has updates" and lets the sync worker fetch
the truth. Because Plaid retries webhooks, the receiver is idempotent: a
duplicate notification simply enqueues a sync that finds nothing new.

### 2. Queue Layer (BullMQ over Redis)

The queue decouples receiving from processing and gives us:

- **Volume absorption** — 500 users transacting at once become a backlog the
workers drain at their own pace, not a thundering herd against the LLM.
- **Failure resilience** — a crashed worker job is retried with exponential
backoff; an exhausted job moves to a dead-letter queue, not the void.
- **Visibility** — Bull Board shows queued / active / failed / completed.

Job types, each with a typed payload and its own DLQ:

- `txn.sync` — fetch new/changed transactions for an item via cursor
- `txn.categorize` — enrich and categorize one transaction
- `anomaly.evaluate` — score a transaction against the user's baseline
- `baseline.recompute` — refresh a user's rolling per-category statistics
- `digest.generate` — build and store a user's weekly digest
- `delivery.send` — deliver a digest or anomaly through a channel

### 3. Sync Worker

Consumes `txn.sync`. It loads the item (decrypting the access token), calls
`syncTransactions(item, cursor)`, and walks the cursor until `hasMore` is
false. For each page it upserts `added` and `modified` transactions and
soft-deletes `removed` ones. Idempotency is guaranteed by a unique constraint
on `plaid_transaction_id`; re-running a sync is always safe. The stored cursor
advances only after a page is durably persisted, so a crash resumes exactly
where it left off. Each newly-added transaction enqueues a `txn.categorize`
job.

### 4. Categorize Worker

Consumes `txn.categorize`. Categorization is a three-tier escalation, cheapest
first:

1. **Plaid Personal Finance Category** — Plaid already returns a structured
  category for most transactions. Use it when confidence is high.
2. **Learned merchant cache** (`merchant_categories`) — look up the normalized
  merchant name. Most spending is repeat merchants (Starbucks, Netflix,
   Amazon), so this resolves the vast majority of transactions with a single
   indexed read.
3. **LLM, on cache miss only** — the first time we see `WHOLEFDS MKT #10220`,
  `LlmProvider.categorizeMerchant` cleans the name to "Whole Foods Market",
   assigns a category, and extracts signals (is this a subscription? recurring?
   a free trial converting to paid?). The result is written back to the cache,
   so we pay for each distinct merchant once, and categories stay consistent
   across weeks.

The worker writes the enriched transaction, enqueues `baseline.recompute` so
the user's rolling stats stay current, and — when a signal warrants it —
enqueues `anomaly.evaluate`.

### 5. Anomaly Worker

Consumes `anomaly.evaluate`. Detection is deterministic statistics, not an LLM:

- **Price increase** — charge from a known recurring merchant exceeds the
rolling median for that merchant by a configurable factor (e.g. ≥ 1.5×).
- **Duplicate charge** — same merchant, same amount, within a short window.
- **New subscription** — a recurring-looking charge from a merchant with no
prior history for this user.
- **Unusual spend** — a single transaction far above the user's category
baseline (e.g. > mean + 3σ).

Each detection produces an `anomaly` row with a `reason` and `severity`.
High-severity anomalies enqueue `delivery.send` immediately — they do not wait
for the weekly digest. Low-severity ones are stored and surface in the next
digest.

### 6. Digest Scheduler

A per-user cron. Each user stores a preferred digest day and time in their
local timezone. The scheduler scans every minute for users whose local digest
moment has arrived and enqueues `digest.generate`. The job uses a
deterministic id, `digest:{userId}:{isoWeek}`, so a scheduler restart, a clock
skew, or two scheduler instances can never produce a duplicate digest — BullMQ
deduplicates on the id. Timezone and DST are honored by computing the user's
local week window, not a UTC one.

### 7. Digest Worker

The core of the product, and a strict division of labor between code and the
model:

1. Compute, in code, everything quantitative: the user's local 7-day window,
  total spend, per-category totals, deltas against their personal baseline,
   and the week's flagged anomalies. This produces a `DigestFacts` struct of
   finished numbers.
2. Pass `DigestFacts` to `LlmProvider.writeDigest`. The model writes the
  narrative — total-spend story, category breakdown vs. baseline, called-out
   anomalies, one or two honest observations — using the figures verbatim. The
   prompt forbids inventing or recomputing numbers.
3. A validation pass checks that every figure in the prose appears in
  `DigestFacts`. Numbers are the trust currency of this product; a digest that
   misstates a total is worse than no digest.
4. Store the digest and enqueue `delivery.send`.

### 8. Delivery Worker

One worker, channel-agnostic. It takes a payload (digest or anomaly), asks the
`DeliveryRouter` for the channel matching the user's preference, and calls
`send`. It knows nothing about content. Weekly digests are always delivered by
email (clean HTML via Resend); anomaly alerts go to the user's preferred
channel — email, or plain-text SMS via Twilio. Delivery results are recorded so
retries and reporting are possible.

### 9. REST API

A thin, authenticated Express API serving the frontend and backing the MCP
server. Every request carries an authenticated user; every query is tenant-
scoped. It handles the Plaid Link flow (connecting a bank), user preferences
(digest day/time, timezone, delivery channel), digest history, and optional
transaction browsing.

### 10. MCP Server

Exposes the system as tools Claude can call, so a user can ask natural-language
questions about their own finances. Every tool call is bound to a single
authenticated user via a scoped, short-lived token minted by the REST API —
there is no ambient "current user", and no tool can read across tenants.

Tools:

- `get_spending_this_week()`
- `compare_to_last_month()`
- `get_spending_by_category(category)`
- `list_recent_anomalies()`
- `get_digest_history(n)`

Each tool is a thin wrapper over the same tenant-scoped repositories the API
uses.

---

## Data Model

```sql
users
  id, email, timezone, digest_day, digest_time,
  delivery_preference, created_at

plaid_items                       -- one bank login = one item
  id, user_id, plaid_item_id,
  access_token_encrypted,         -- encrypted at rest via Crypto port
  sync_cursor,                    -- resumable /transactions/sync cursor
  status, last_synced_at

accounts                          -- many accounts per item
  id, item_id, user_id, plaid_account_id, name, type, last_synced_at

transactions
  id, account_id, user_id, plaid_transaction_id (unique),
  amount, currency, merchant_name, merchant_name_raw,
  category, plaid_pfc, is_subscription, is_recurring,
  occurred_at, enriched_at, removed_at        -- soft delete for Plaid removals

merchant_categories               -- learned cache; LLM paid once per merchant
  id, normalized_merchant (unique), merchant_name,
  category, signals_json, source (plaid|llm), updated_at

spend_baselines                   -- precomputed rolling stats per user/category
  id, user_id, category, period,
  mean, median, stddev, sample_count, computed_at

digests
  id, user_id, week_start, week_end,
  facts_json,                     -- the deterministic figures the prose used
  content, subject, delivered_at

anomalies
  id, transaction_id, user_id, reason, severity,
  detected_at, delivered_at
```

`user_id` is present and indexed on every tenant-owned table. Repositories
require it on every read and write; isolation is not optional.

All monetary columns (`transactions.amount`, and the `mean`/`median`/`stddev`
in `spend_baselines`) are stored as integer **minor units** (e.g. cents)
alongside a `currency` column — never as floats. This mirrors the `Money` value
object in `conventions.md`; arithmetic happens only on integers.

---

## Categorization & The Money Contract

Two ideas do most of the heavy lifting for correctness and cost:

**The escalation ladder** (Plaid PFC → learned cache → LLM) means the LLM is
invoked roughly once per *distinct merchant*, globally across all users (the
`merchant_categories` cache is keyed on the normalized merchant name, not on the
user — "Whole Foods" cleans and categorizes identically for everyone), not once
per transaction. At 500 users this turns a per-transaction LLM bill into a
small, slowly-growing one, and it keeps a merchant's category stable week over
week. Per-user signals like "is *this* user actually subscribed?" are derived
from the user's own transactions, not from the shared cache.

**The money contract** means the LLM never touches arithmetic. Code computes
`DigestFacts`; the model narrates them; a validator rejects any prose figure
not present in the facts. This is the single most important reliability
decision in a product whose entire value rests on being trusted with numbers.

---

## Baselines & Cold Start

The digest's value is "compared to what's normal *for you*", which requires a
baseline. `spend_baselines` stores rolling per-user, per-category statistics
(mean, median, stddev), refreshed by a `baseline.recompute` job that the
categorize worker enqueues after each transaction is enriched, so the digest
and anomaly workers read precomputed stats instead of scanning history on every
job.

A new user has no baseline. For the first few weeks the digest degrades
gracefully: it reports what was spent and how categories compare *to each
other*, explicitly frames itself as still learning, and switches on
baseline-relative language ("up 30% from your usual") only once there is enough
history to be honest. Anomaly detection that depends on a baseline is
suppressed until the sample size is meaningful.

---

## Multi-Tenancy & Scale

- **Isolation:** every query is `user_id`-scoped at the repository layer; jobs
carry the tenant in their payload; secrets are per-item and encrypted.
- **Horizontal scale:** workers are stateless and scale by running more
processes; BullMQ distributes jobs across them. The API and scheduler scale
the same way (the scheduler stays correct under multiple instances because
digest jobs are idempotent by id).
- **Backpressure:** spikes become queue depth, not failures. LLM concurrency is
bounded so we never exceed provider rate limits regardless of load.
- **Sufficiency:** a single Postgres and single Redis comfortably serve the
target scale. The architecture leaves room to add read replicas or partition
by tenant later, but does not pay that complexity now.

---

## Security & Privacy

This is financial PII, so security is a first-class requirement, not a layer
added later.

- **Authentication:** every REST and MCP request is authenticated and resolved
to a user before any data access.
- **Secrets at rest:** Plaid access tokens (and any other secrets) are
encrypted via the `Crypto` port with a key held outside the database.
- **Webhook authenticity:** Plaid webhooks are verified against Plaid's
rotating signing keys before anything is enqueued.
- **MCP scoping:** tool access uses short-lived, per-user tokens; no tool can
reach another tenant's data.
- **Least exposure:** the frontend and MCP read through the same tenant-scoped
repositories; there is no privileged path that bypasses isolation.

---

## Reliability & Operability

- **Idempotency everywhere:** unique `plaid_transaction_id` for ingestion,
deterministic `digest:{userId}:{isoWeek}` for digests, resumable sync cursor
for fetches.
- **Retries + DLQ:** every queue retries with backoff and routes exhausted
jobs to a dead-letter queue that triggers an alert. Failures are visible and
recoverable, never silent.
- **Observability:** structured logging through the `Logger` port, error
tracking, and Bull Board for queue state. Each job logs its tenant and job id
for traceability.
- **Testing:** the domain is pure and tested against fakes (`FakeLlmProvider`,
in-memory repositories, a controllable `Clock`). Adapters are covered by
contract tests against vendor sandboxes. The money contract has dedicated
tests asserting the LLM cannot introduce a figure absent from `DigestFacts`.

---

## Tech Stack With Reasoning


| Layer         | Choice                                 | Why                                                                             |
| ------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| Language      | TypeScript                             | Type safety across the whole system; typed ports are enforced at compile time   |
| Runtime       | Node.js                                | Async I/O fits an event-driven system; huge ecosystem                           |
| Web framework | Express                                | Simple, well-understood, no magic                                               |
| Queue         | BullMQ + Redis                         | Battle-tested, dashboard, retries/DLQ, deterministic job ids, TypeScript-native |
| Database      | PostgreSQL                             | Relational data with real transactions and constraints                          |
| ORM           | Prisma                                 | Type-safe queries, clean migrations, readable schema                            |
| LLM           | Claude via Anthropic SDK               | Best at structured categorization and natural narrative                         |
| Bank data     | Plaid                                  | Industry standard; OAuth bank connections; `/transactions/sync`                 |
| Email         | Resend                                 | Modern API, good TypeScript SDK, reliable deliverability                        |
| SMS           | Twilio                                 | Industry standard for SMS                                                       |
| Frontend      | React + Vite                           | Simple, fast; not the focus of this project                                     |
| MCP           | Anthropic MCP TypeScript SDK           | Official SDK, straightforward                                                   |
| Validation    | Zod                                    | Runtime validation at every boundary (jobs, env, webhooks)                      |
| Monorepo      | npm workspaces + TS project references | Shared packages, independent deploys, no extra tooling                          |


---

## Repository Structure

```
/
├── apps/
│   ├── api/            # Express REST + webhooks; buildApiContainer (producer only)
│   ├── workers/        # BullMQ consumers; buildWorkerContainer + job-handlers
│   ├── scheduler/      # Per-user idempotent digest scheduler (producer only)
│   ├── mcp-server/     # MCP server exposing tenant-scoped finance tools
│   └── web/            # React frontend
├── packages/
│   ├── core/           # Domain types, PORTS (interfaces), pure domain services
│   ├── config/         # Zod-validated env + layered YAML tunables
│   ├── wiring/         # Shared composition builders (repos, services, queue)
│   ├── db/             # Prisma schema + repository adapters (implement core ports)
│   ├── queue/          # Typed job contracts + BullMQ producer/consumer adapter
│   ├── plaid/          # BankProvider adapter + webhook verification
│   ├── llm/            # LlmProvider adapter (Claude) + FakeLlmProvider
│   └── delivery/       # DeliveryChannel adapters (Resend, Twilio) + router
├── config/             # default.yaml + env overlays (application tunables)
└── docker-compose.yml  # PostgreSQL + Redis for local dev
```

`packages/core` defines the ports and the business logic; adapter packages
implement ports; `packages/wiring` assembles them into services; each `apps/*`
process calls a slim builder for what it needs. `core` depends on nothing;
everything else depends inward. That dependency direction is the whole game —
it is why any vendor can be replaced and why this backend can be embedded in a
larger system without dragging vendors with it.

---

## Build Order

A vertical slice first — bank connected to delivered digest end to end —
before breadth.

1. `docker-compose.yml` — PostgreSQL and Redis locally
2. `packages/core` — domain types and ports (the contracts everything implements)
3. `packages/config` — env, layered YAML, logger, clock, crypto
4. `packages/db` — Prisma schema and repository adapters
5. `packages/queue` — typed job contracts and BullMQ adapter
6. `packages/plaid` — webhook verification and `/transactions/sync`
7. `packages/wiring` — shared composition builders
8. `apps/api` — webhook receiver + Plaid Link flow (`buildApiContainer`)
9. `apps/workers` — sync worker, then categorize worker (`buildWorkerContainer`)
10. `packages/llm` — categorization escalation + FakeLlmProvider
11. `apps/workers` — digest worker with the money contract
12. `packages/delivery` — email delivery + delivery worker
13. `apps/scheduler` — per-user idempotent scheduling
14. `apps/mcp-server` — tenant-scoped tools over the existing repositories

Anomaly detection and the React frontend follow once the core loop runs end to
end.