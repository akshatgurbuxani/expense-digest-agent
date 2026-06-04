# Testing

The architecture is designed so the most important logic is the easiest to
test. Because the domain depends only on ports, we test it against in-memory
fakes — no database, no network, no LLM — at unit speed. Adapters get a thinner
layer of contract tests against vendor sandboxes. And the one property the
product cannot get wrong — the money contract — gets a dedicated test.

Runner: **Vitest**. Tests live next to the code as `*.test.ts`.

---

## The testing pyramid for this system

```
        ┌──────────────────────────────┐
        │  e2e (few)                    │  one bank-link → digest delivered, on dev infra
        ├──────────────────────────────┤
        │  adapter contract tests       │  Plaid/Resend/Twilio sandboxes, Prisma on test DB
        ├──────────────────────────────┤
        │  domain service tests (many)  │  services + fakes; no I/O; fast
        ├──────────────────────────────┤
        │  pure function tests (most)   │  Money, window math, baselines, detectors
        └──────────────────────────────┘
```

The pyramid is wide at the bottom *on purpose*: window math, baseline stats,
anomaly detectors, and the money contract are pure functions, and that is where
the logic that matters actually lives.

---

## Fakes implement the same ports

Every port has a hand-written fake (in `packages/core/src/testing/` so all
packages can import them). Fakes are real, simple implementations — not mocks
with brittle expectations. They are constructed and injected exactly like the
real adapters, via the same `deps` object.

```ts
// a fake repository = a Map keyed by id, tenant-scoped like the real one
export function makeFakeTransactionRepo(): TransactionRepository {
  const byId = new Map<string, Transaction>();
  return {
    async upsertMany(userId, txns) {
      const inserted: TransactionId[] = [];
      for (const t of txns) {
        if (!byId.has(t.plaidTransactionId)) inserted.push(t.id);
        byId.set(t.plaidTransactionId, t); // dedupe on plaid id, like prod
      }
      return { insertedIds: inserted };
    },
    async listInWindow(userId, start, end) {
      return [...byId.values()].filter(
        (t) => t.userId === userId && t.occurredAt >= start && t.occurredAt < end && !t.removedAt,
      );
    },
    /* …rest… */
  } as TransactionRepository;
}
```

Key fakes:

- **`FakeLlmProvider`** — deterministic: title-cases names, maps via a tiny
  fixed table, renders a template digest from `DigestFacts`. Implements the
  identical contract, so a service under test cannot tell it from Claude.
- **`FixedClock`** — `now()` returns a settable instant; tests advance time to
  trigger "is a digest due?" and "duplicate within 1 hour?" without waiting.
- **In-memory repositories** — `Map`-backed, tenant-scoped, dedupe-on-vendor-id
  just like the Prisma versions.
- **`FakeBankProvider`** — returns scripted `SyncPage`s, including a multi-page
  `hasMore` sequence so cursor-paging logic is exercised.
- **`CapturingChannel`** — records `OutboundMessage`s instead of sending, so
  delivery is asserted, not mailed.

A service test then reads like prose:

```ts
it("categorizes via cache without calling the LLM on a repeat merchant", async () => {
  const llm = new CountingLlm(makeFakeLlmProvider()); // counts calls
  const svc = makeCategorizeService({ ...fakes, llm });

  await svc.categorize(userId, firstTxnAtNewMerchant);  // miss → LLM, cached
  await svc.categorize(userId, secondTxnSameMerchant);  // hit → cache

  expect(llm.calls).toBe(1); // the escalation ladder, proven
});
```

That single test pins the most important cost property of the system, in
milliseconds, with no network.

---

## The money contract test (non-negotiable)

The product's core promise is that numbers are right. We enforce it two ways.

**1. Pure-function tests on the math.** Totals, percentages, deltas, and
baseline stats are pure functions over `Money`. They get exhaustive,
table-driven tests including the nasty cases: rounding, zero baselines,
negative amounts (refunds), mixed-sign weeks.

```ts
it.each([
  [["10.00", "0.99", "0.01"], "$11.00"],
  [["-5.00", "5.00"], "$0.00"],
])("sums %s to %s", (parts, expected) => {
  const total = parts.map((p) => Money.fromDecimalString(p, "USD")).reduce((a, b) => a.add(b));
  expect(total.toDecimalString()).toBe("11.00"); // formatting checked separately
});
```

**2. The "LLM cannot invent a number" guard.** A validator extracts every
currency-looking token from the model's prose and asserts each appears in the
`DigestFacts` it was given. The test runs it against an *adversarial* fake that
deliberately tries to add a fabricated figure, and asserts the validator
rejects it.

```ts
it("rejects a digest that contains a figure not in the facts", () => {
  const facts = sampleFacts({ totalSpend: "$1,204.55" });
  const proseWithLie = "You spent $1,204.55 this week, including $999.00 on snacks.";
  expect(() => assertNoInventedNumbers(proseWithLie, facts)).toThrow(ValidationError);
});
```

This guard runs in production too (it is the validation step of the digest
worker); the test just proves it actually catches a lie. If this test is
deleted, CI fails — it is load-bearing.

---

## Adapter contract tests

Adapters are thin, but the thin part is where vendor reality bites, so each gets
a focused contract test:

- **Prisma repositories** run against a real Postgres (the `docker-compose`
  one, or a disposable container in CI). They prove tenant scoping (a query for
  user A never returns user B's rows), upsert idempotency on `plaid_transaction_id`,
  and soft-delete behavior.
- **`PlaidBankProvider`** runs against the Plaid **sandbox**: link-token
  creation, public-token exchange, and a real `transactions/sync` paging loop.
  Webhook verification is tested with Plaid's sample signed payloads.
- **Delivery adapters** run in sandbox/test mode (Resend test key, Twilio test
  credentials) or are asserted via `DELIVERY_DRY_RUN`.
- **Queue adapter** runs against the dev Redis: proves `jobId` idempotency
  (enqueueing the same `digest:{userId}:{isoWeek}` twice yields one job) and
  that a thrown non-retryable error lands in the DLQ.

These are slower and fewer, gated behind a `test:integration` script so the
fast unit suite stays the default inner loop.

---

## Mail pipeline harness (L2)

Gmail receipt tests that span `mail.sync` → `receipt.parse` → `receipt.match`
use `makeMailPipelineHarness()` from `@expense/core/testing`. It wires the same
four domain services and in-memory job handlers as production workers, without
`@expense/wiring` or BullMQ — fast enough for scenario matrices in `npm test`.

```ts
const harness = makeMailPipelineHarness({ mail: makeFakeMailProvider({ ... }) });
const { userId, mailAccountId } = await harness.setupUser();
await harness.runSync({ userId, mailAccountId });
// assert on harness.repos.receipts, transactionReceiptLinks, etc.
```

**Scenario catalog:** `packages/core/src/testing/receipt-scenarios.ts` — eight
declarative cases. Run via `mail-receipt-scenarios.test.ts` on every `npm test`.

**L4 gmail e2e:** `apps/api/e2e/gmail-to-digest*.e2e.ts` — webhook → receipt link
→ digest facts (`npm run test:integration`).

**Investor demo:** `npm run demo:replay` → `demo-output/index.html` — see
[demo-harness.md](./demo-harness.md).

Isolated service tests (`mail-ingest.test.ts`, `receipt-parse-service.test.ts`,
`receipt-match-service.test.ts`) pin single-step behavior without running the
full job chain.

**LLM receipt fixtures:** `packages/llm/src/testing/receipt-fixtures.ts` —
15 declarative emails covering order confirmations, rideshare, food delivery,
subscriptions, travel, events, refunds, invoices, PayPal, unknown merchants,
and HTML-only bodies. Mocked tests in `claude-receipt-extractor.test.ts` loop
the catalog; live Claude runs use the same list when `ANTHROPIC_API_KEY` is set
(`claude-receipt-extractor.itest.ts`).

Full-stack slices (webhook → digest on Postgres + Redis) use
`buildWorkerContainer` instead; scenario **fixtures** from the harness layer
can be reused there in a later step.

---

## What every test follows

- **Build a container of fakes**, mirroring the real composition root
  ([factories-and-composition.md](./patterns/factories-and-composition.md)).
  Same wiring path, fakes swapped in — so the test exercises real wiring.
- **Arrange–act–assert**, no shared mutable state between tests; each builds its
  own fakes.
- **Assert behavior, not implementation.** We assert "the LLM was called once"
  or "user B's data never appeared", not internal call shapes.
- **Determinism.** `FixedClock` and seeded data only; no `Date.now()`, no random
  ids without a seeded `newId`. A flaky test is a bug to fix, never to retry.

---

## Deferred: Verification roadmap

The following gaps were identified during development but deprioritized after
the YAML scenario runner (`npm run scenario`) went live — it covers multi-user
pipeline execution with visible output, which was the primary goal.

- **Gap 1** (full-pipeline demo) — partially addressed by `scenario-runner.e2e.ts`
- **Gap 2** (load simulation) — deferred
- **Gap 3** (web UI seed + verify) — deferred
- **Gap 4** (observability trace) — partially addressed by `scripts/trace-user.sh`
