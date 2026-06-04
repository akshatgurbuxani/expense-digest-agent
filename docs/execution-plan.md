# Execution Plan (TDD)

> **Status: all phases complete.** Phases 0–13 and the Gmail receipt enrichment
> track (G0→G10) are shipped. This document is preserved as a record of the
> build sequence — every step here was executed in order.

How we turned the docs into a working system, test-first. This plan was the
schedule; the [code map](./code-map.md) is the inventory; the other docs are
the specs. We built in thin, test-driven increments, inside-out (pure core
first), with one early end-to-end slice to de-risk integration.

> **The cardinal rule:** no production line of code was written before a failing
> test asked for it. Red → Green → Refactor, every time.

---

## 1. The TDD loop we actually run

For every unit of behavior:

1. **Red** — write the smallest test that expresses the next required behavior.
   Run it. Watch it fail for the *right* reason (assertion, not a typo/compile
   error).
2. **Green** — write the least code that makes it pass. Hardcoding first is
   allowed; the next test removes the hardcode.
3. **Refactor** — clean up names, extract helpers, remove duplication. Tests
   stay green. No new behavior here.
4. Commit at green. Small commits, each a coherent step.

We do **not** write a whole module then test it. We grow the module one test at
a time.

### Outside-in vs inside-out

We use **inside-out (classicist) TDD**: start from pure domain functions and
build upward to services, then adapters, then wiring. Reasons: the highest-value
logic (money math, windows, baselines, the money contract) is pure and trivial
to drive with tests, and our fakes ([testing.md](./testing.md)) let us test
services without any real I/O. The one exception is the **early vertical slice**
(Phase 6) where we go outside-in to prove the wiring before filling breadth.

---

## 2. Test taxonomy & "simple but appropriate"

We deliberately keep the suite small and meaningful. Mapping to
[testing.md](./testing.md):

| Level | Scope | Speed | Where | Default? |
|------|-------|-------|-------|----------|
| **L1 pure** | a single pure function / value object | µs | `*.test.ts` next to code | yes (`npm test`) |
| **L2 component** | one domain service + fakes for its ports | ms | next to the service | yes (`npm test`) |
| **L3 contract** | one adapter against real infra (Postgres/Redis/Plaid sandbox) | s | `*.itest.ts` | gated (`npm run test:integration`) |
| **L4 e2e slice** | webhook → workers → delivery, on docker infra | s+ | `apps/*/e2e` | gated, CI nightly + pre-release |

**"Simple but appropriate" means:**

- **L1 + L2 are the bulk** and run on every save. They cover all business
  rules: categorization escalation, anomaly thresholds, digest facts, money,
  windows, idempotency logic, error classification.
- **L3 is one focused test per adapter** proving the thing that only real infra
  can prove (tenant scoping in SQL, `jobId` dedupe in Redis, Plaid paging,
  webhook signature). Not exhaustive — just the vendor-reality risk.
- **L4 is exactly one happy-path slice.** It proves the pieces connect. It is
  not where we test business rules (those are already covered cheaply at L1/L2).
- We assert **behavior and contracts**, never internal call shapes. No mock
  ceremony, no snapshot-everything. A test that breaks on a harmless refactor is
  a liability and gets deleted or rewritten.
- Coverage is an outcome, not a target. We don't chase 100%. We do require that
  every documented contract and every branch of business logic has a test.

### Each port's contract becomes shared "contract tests"

Where multiple implementations share a port (the real adapter + its fake, e.g.
`LlmProvider`, repositories, `DeliveryChannel`), we write **one parametrized
test suite against the interface** and run it against both. This guarantees the
fake cannot drift from the real adapter's contract — the property our entire
L2 layer depends on.

```ts
// runs against makeFakeLlm() AND makeClaudeLlm() (the latter under test:integration)
describe.each(llmImplementations)("LlmProvider contract: %s", (makeLlm) => {
  it("returns a category within the CATEGORIES enum", async () => { /* … */ });
  it("rejects an out-of-enum response as ValidationError", async () => { /* … */ });
});
```

---

## 3. Tooling we stand up first (Phase 0)

Before any feature test, the harness must exist:

- **Vitest** at the root with two projects: `unit` (default, L1+L2, no infra)
  and `integration` (L3+L4, requires docker). Scripts: `test`, `test:watch`,
  `test:integration`.
- **tsconfig** project references so `tsc -b` type-checks the whole graph; a
  failing typecheck fails CI.
- **ESLint** with the boundary rule: `packages/core` may not import any adapter
  package or vendor SDK (enforces the dependency arrow from
  [factories-and-composition.md](./patterns/factories-and-composition.md)).
- **docker-compose** (Postgres + Redis) and a `test:integration` pretask that
  waits for health.
- **CI**: `typecheck → lint → test` on every push; `test:integration` on PRs to
  main.

Definition of done for Phase 0: a trivial `money.test.ts` with one failing
assertion runs red, and the harness reports it. That proves the loop works
before we rely on it.

---

## 4. Phases

Each phase lists **tests first**, then the implementation they drive, then a
**Definition of Done (DoD)**. Phases follow the
[build order](./expense-digest-architecture.md#build-order); within a phase we
build inside-out.

### Phase 0 — Walking harness
- **Build:** workspaces, `tsconfig.base.json`, root `tsconfig.json`, Vitest
  projects, ESLint boundary rule, `docker-compose.yml`, `.env.example`, CI.
- **DoD:** `npm test` runs and reports a deliberately-failing placeholder test;
  `tsc -b` passes on an empty graph; `docker compose up` brings up PG+Redis
  healthy.

### Phase 1 — Core primitives (pure, L1)
The bedrock. Pure, no dependencies, highest test density.
- **Tests first:**
  - `money.test.ts` — integer invariant; `fromDecimalString("10.99")`;
    `add`/`ratioTo`; currency-mismatch throws; `toDecimalString` rounding;
    negative (refund) amounts; the `0.1 + 0.2` regression.
  - `ids.test.ts` — `newId()` uniqueness + sortability; brand type guards (a
    compile-time check via `tsd`/`expectTypeOf`).
  - `errors.test.ts` — each error's `code`/`retryable`; `cause` preserved.
  - `registry.test.ts` — register/get; duplicate-key throws; unknown-key throws;
    chainable register.
- **Build:** `money.ts`, `ids.ts`, `errors.ts`, `registry.ts`.
- **DoD:** all L1 green; `core` still imports nothing.

### Phase 2 — Config (L1)
- **Tests first:** `env.test.ts` — valid env parses to typed `Env`; missing
  required var throws `ValidationError` with the field; bad `ENCRYPTION_KEY`
  length rejected. `crypto.test.ts` — `encrypt`→`decrypt` round-trips; tampered
  ciphertext throws `InvariantError`. `clock.test.ts` — `FixedClock` advances.
- **Build:** `env.ts`, `logger.ts`, `clock.ts`, `crypto.ts`.
- **DoD:** config parses from `.env.example`; crypto round-trip proven.

### Phase 3 — Domain types + pure functions (L1)
The math that the product's trust rests on. All pure.
- **Tests first:**
  - `window.test.ts` — `weekWindowFor` across timezones and a **DST boundary**;
    user's local Sun 08:00 maps to the right UTC instants.
  - `baseline-math.test.ts` — mean/median/stddev over `Money[]`; empty input;
    single sample; `sampleCount` gating.
  - `digest-facts.test.ts` — given txns + baselines → correct totals, shares,
    `TrendFact`s; **`maturity: "learning"`** nulls out every `vsBaseline`;
    refund/zero-baseline cases.
  - `money-contract.test.ts` — `assertNoInventedNumbers` passes clean prose;
    **throws on a fabricated figure** (the load-bearing guard).
  - `anomaly-detectors.test.ts` — each of the 4 detectors as a truth table:
    price-increase ≥1.5×, duplicate within window, new-subscription, >mean+3σ;
    and the negative cases that must **not** fire.
- **Build:** `domain/*` types, `window.ts`, `baseline-math.ts`,
  `digest-facts.ts`, `money-contract.ts`, `anomaly-detectors.ts`,
  `category.ts`.
- **DoD:** every business rule that is "just math" is green and pure. This is
  the most important phase; spend tests generously here.

### Phase 4 — Ports + fakes (no production logic)
- **Build:** all `ports/*` interfaces; all `testing/*` fakes
  (`FixedClock`, `FakeLlm`, `FakeBank`, in-memory repos, `CapturingChannel`,
  builders).
- **Tests first:** the **port contract suites** (§2) — written now, run against
  the fakes immediately and against real adapters later. Fakes must pass their
  own contracts before any service depends on them.
- **DoD:** fakes implement every port and pass the shared contract suites.

### Phase 5 — Domain services (component, L2)
Now the orchestration, tested with fakes only — no real I/O.
- **Tests first (one service at a time):**
  - `categorize-service.test.ts` — **escalation ladder:** new merchant → LLM
    called once + cached; repeat merchant → cache hit, LLM **not** called
    (assert call count); Plaid-PFC short-circuits before cache; unknown →
    `other` fallback, never throws. Enqueues `anomaly.evaluate` on a signal.
  - `sync-service.test.ts` — multi-page `hasMore` loop via `FakeBank`; cursor
    saved **after** each page; re-run is a no-op (idempotent upsert); `removed`
    soft-deletes; each new txn enqueues `txn.categorize`.
  - `digest-service.test.ts` — computes facts → calls `FakeLlm.writeDigest` →
    **runs money-contract validator** → stores digest → enqueues
    `delivery.send`. A digest with an invented number is rejected (wire the
    adversarial fake).
  - `anomaly-service.test.ts` — runs the detector registry, high-severity
    enqueues immediate `delivery.send`, low-severity stored only.
  - `baseline-service.test.ts` — on `baseline.recompute`, reads the user's txns,
    calls the pure `baseline-math`, and upserts per-category stats; gates
    `maturity` by `sampleCount`.
  - `delivery-service.test.ts` — routes by preference via the registry;
    `CapturingChannel` receives the right `OutboundMessage`; records result;
    unknown channel → `InvariantError`.
- **Build:** `services/*` factory functions + the resolver chain + registries.
- **DoD:** the entire business workflow is proven against fakes. If this phase
  is green, the system is *logically* correct before a single byte of real I/O.

### Phase 6 — First vertical slice (outside-in, L4) ⟵ de-risk early
Before building all adapters, prove the wiring with the **minimum real path**:
in-memory/fake adapters swapped for the two riskiest real ones incrementally.
- **Tests first:** `apps/api/e2e/webhook-to-digest.e2e.ts` — POST a (fake-signed)
  Plaid webhook → assert a `txn.sync` job enqueued → run the worker → assert a
  digest row created and a `CapturingChannel`/`DryRun` delivery recorded. Uses
  the real wiring path: `buildWorkerContainer` + `registerJobHandlers` with
  `LLM_FAKE=true`, `DELIVERY_DRY_RUN=true`, and fake bank/queue at first.
- **Build:** `apps/api` (`buildApiContainer`) + webhook route (raw body + verify
  stub), `apps/workers` (`buildWorkerContainer` + `job-handlers.ts`).
- **DoD:** one green end-to-end happy path through the real wiring with fakes at
  the edges. Proves the seams fit. **This is the project's heartbeat test** from
  here on.

### Phase 7 — DB adapter (contract, L3)
- **Tests first:** `*.itest.ts` against docker Postgres — tenant scoping (user A
  query never returns user B), `upsertMany` idempotency on
  `plaid_transaction_id`, soft-delete, `withAccessToken` decrypt-in-scope,
  `findDueForDigest` time query. Re-run the **repository port contract suite**
  against the real repos.
- **Build:** `schema.prisma`, migrations, `mappers.ts`, all repos.
- **DoD:** real repos pass the same contract suite the fakes pass; integration
  tests green. Swap repos into the Phase-6 slice; heartbeat still green.

### Phase 8 — Queue adapter (contract, L3)
- **Tests first:** against docker Redis — `jobId` idempotency
  (`digest:{u}:{w}` twice → one job); retryable error retries with backoff;
  non-retryable → DLQ; graceful `stop()` drains in-flight.
- **Build:** `jobs.ts`, `producer.ts`, `consumer.ts` (the `runHandler`
  wrapper), `dead-letter.ts`.
- **DoD:** queue semantics from [error-handling.md](./error-handling.md) proven;
  swap real queue into the slice; heartbeat green.

### Phase 9 — Plaid adapter (contract, L3)
- **Tests first:** against Plaid **sandbox** — link-token, public-token
  exchange, real `transactions/sync` paging loop; webhook JWT verification with
  Plaid sample payloads (valid passes, tampered → `InvariantError`).
- **Build:** `plaid-bank-provider.ts`, `webhook-verify.ts`, `mappers.ts`.
- **DoD:** `BankProvider` contract suite passes against the real adapter; real
  webhook verification swapped into the API; heartbeat green.

### Phase 10 — LLM adapter (contract, L3)
- **Tests first:** `LlmProvider` contract suite against `makeClaudeLlm` (gated,
  needs key): category within enum; malformed/out-of-enum → `ValidationError`;
  bounded concurrency never exceeds the limit (assert with a counting limiter).
- **Build:** `claude-llm-provider.ts`, prompts, `concurrency.ts`.
- **DoD:** real and fake LLM pass the identical contract; the money-contract
  validator still rejects real-model invented numbers in a recorded-response
  test.

### Phase 11 — Delivery adapters (contract, L3)
- **Tests first:** `DeliveryChannel` contract suite against Resend (test key)
  and Twilio (test creds); transient failure → `UpstreamError`; bad recipient →
  `InvariantError`. Template tests (L1): `DigestFacts`/prose → HTML/text contain
  exactly the provided figures, no arithmetic.
- **Build:** `email-channel.ts`, `sms-channel.ts`, `dry-run-channel.ts`,
  `router.ts`, templates.
- **DoD:** real delivery swapped in behind `DELIVERY_DRY_RUN=false` in
  integration; heartbeat green with real email in sandbox.

### Phase 12 — Scheduler + MCP (L2/L3)
- **Tests first:** `scheduler` — given users due at `FixedClock.now()`,
  enqueues exactly one idempotent `digest.generate` each; running twice in the
  same minute enqueues no duplicates. `mcp` tools — each returns tenant-scoped
  data; a token for user A cannot read user B (authorization test).
- **Build:** `apps/scheduler`, `apps/mcp-server` + tools.
- **DoD:** scheduled digests fire idempotently; MCP tools proven tenant-safe.

### Phase 13 — Anomaly end-to-end + frontend (later)
- Wire `anomaly.evaluate` into the live flow with immediate delivery for
  high-severity; extend the e2e slice with an anomaly path. Then `apps/web`
  (Plaid Link, preferences, digest history) — tested with component tests on the
  few stateful pieces only.

---

## 5. Definition of Done — per file & per phase

A file is done when:
- its behavior is covered by tests that were written **before** it,
- it obeys [conventions.md](./conventions.md) (Money/ids/time/errors/naming),
- it exposes only its port type where it's an adapter,
- `tsc -b` and `eslint` are clean.

A phase is done when:
- all its tests are green in the right project (unit vs integration),
- the **heartbeat e2e** (from Phase 6 onward) is still green,
- nothing in `core` imports an adapter (lint-enforced),
- it's committed in small green steps.

---

## 6. Milestones (vertical value)

| Milestone | Phases | We can demonstrate |
|-----------|--------|--------------------|
| **M1 — Logic correct** | 0–5 | The whole business workflow proven against fakes, zero infra. |
| **M2 — It connects** | 6 | One real end-to-end happy path (fakes at edges). Heartbeat test exists. |
| **M3 — Real data** | 7–9 | Real Plaid sync → Postgres → categorized, through the queue. |
| **M4 — Real digest** | 10–11 | Real Claude narrative, money-contract enforced, real email delivered. |
| **M5 — Autonomous** | 12 | Scheduled weekly digests + MCP querying, tenant-safe. |
| **M6 — Complete** | 13 | Live anomaly alerts + frontend. |
| **M7 — Gmail track** | G0→G10 | Gmail OAuth connect, receipt ingest, match, enriched digests, monthly reports, web onboarding gate. |

---

## 7. Guardrails we keep the whole way

- **Heartbeat first.** From Phase 6, the e2e slice runs in CI on every PR. If it
  goes red, that's the priority — the system stopped connecting.
- **Fakes never drift.** Real adapters and fakes share contract suites; both
  must pass. This is what keeps L2 honest.
- **No test-after.** If code appears without a prior failing test, it doesn't
  merge. Reviews check the diff order (test commit before/with impl).
- **Keep it small.** If a test needs heavy setup, the unit is too big — split it
  until the test is simple. Test pain is a design signal.
- **Money has no mercy.** Any change touching amounts requires an L1 money test
  and leaves the money-contract guard intact.

---

## 8. Where we start

Phase 0, one file at a time, beginning with the harness and a single failing
`money.test.ts` to prove the loop. We do not advance a phase until its DoD is
met and the heartbeat (once it exists) is green.

---

## 9. Gmail receipt enrichment (G1→G10)

Phases 0–13 delivered the expense digest backbone. The CFO agent extension —
Gmail connect, receipt ingest, transaction matching, unmatched reporting, and
monthly expense reports — is specified in
[`gmail-receipt-enrichment.md`](./gmail-receipt-enrichment.md).

**Rule:** same TDD loop. No production code before a failing test. Fake
`MailProvider` for L1/L2/e2e; real `@expense/gmail` adapter ships in G5 (not
deferred).

| Phase | Focus | DoD |
|-------|-------|-----|
| G1 | Pure domain: classifiers, match scorer, unmatch reasons | ✓ Unit tests green |
| G2 | Ports + fakes + contracts | ✓ Contract suite passes |
| G3 | Services + jobs + in-memory e2e | ✓ Fake push → match; history 404 → fullSync |
| G4 | Postgres repos | ✓ Integration tests green |
| G5 | Real Gmail adapter + OAuth routes | ✓ Dev connect; MIME walk; stop/revoke |
| G6 | Pub/Sub webhook (OIDC) + watch renewal | ✓ Webhook + worker handlers wired |
| G7 | Receipt extractor (Claude) | Parse fixtures reliably |
| G8 | Digest + report facts (matched + unmatched) | Facts tests green |
| G9 | Monthly `report.generate` + delivery | Email sends on schedule |
| G10 | Web onboarding (bank + Gmail required) | Setup gate complete |

**Ops in parallel with G5–G6:** Google Cloud OAuth app, Pub/Sub topic, restricted
scope verification (CASA for public launch).

Start with **G1** — zero Google infra, maximum design validation.
