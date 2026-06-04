# Factories & Composition

How adapters get built and wired to ports — without a DI framework, without
decorators, without a global container. The whole strategy is three ideas:
**factory functions** that build a thing from its config, a **shared wiring
package** (`@expense/wiring`) that knows how to assemble adapters into domain
services, and **one thin composition root per process** that calls the right
builder for what that process actually needs.

---

## Factories: `make<Thing>(config) => Thing`

Every adapter and every domain service is created by a factory function. A
factory takes plain config/dependencies and returns something typed as a
**port**, never as its concrete class. The vendor SDK is created and hidden
inside; callers receive only the interface.

```ts
// packages/plaid/src/plaid-bank-provider.ts
export function makeBankProvider(cfg: PlaidConfig): BankProvider {
  const client = new PlaidApi(/* …cfg… */); // vendor SDK lives only in here
  return {
    async createLinkToken(userId) { /* … */ },
    async exchangePublicToken(publicToken) { /* … */ },
    async syncTransactions(input) { /* … */ },
    async verifyWebhook(headers, rawBody) { /* … */ },
  };
}
```

Why factory functions over classes + `new`:

- The return type is the **port**, so callers physically cannot reach a vendor
  method that isn't in the contract.
- Config is bound once in a closure; there is no half-constructed object and no
  `init()` step to forget.
- Swapping the implementation is swapping which `make*` you call — a one-line
  change isolated to the wiring layer.

Domain services use the identical shape, taking a `deps` object
([conventions.md §6](../conventions.md#6-functions-take-a-dependencies-object-not-positional-services)):

```ts
export function makeDigestService(deps: DigestDeps) {
  return { async run(payload) { /* … */ } };
}
```

So the same mental model — `make<Thing>(stuff) => contract` — applies to
adapters and domain logic alike. One shape to learn.

---

## Shared wiring: `@expense/wiring`

Adapter packages are imported only here (and in thin app composition roots that
delegate to wiring). The wiring package exposes small **resolver** functions and
one **service builder**:

| Function | Purpose |
|----------|---------|
| `resolveConfig(opts)` | `env` + `app` from `loadConfig()` or test overrides |
| `resolveRepos(env, opts)` | Postgres repos or in-memory fakes |
| `resolveBank(env, opts)` | Plaid or `FakeBank` |
| `resolveLlm(env, app, opts)` | Claude or `FakeLlm` |
| `resolveMail(env, opts)` | Gmail or `FakeMail` |
| `resolveReceiptExtractor(env, opts)` | Claude or `FakeReceiptExtractor` |
| `resolveDelivery(env, log, opts)` | Resend/Twilio, dry-run, or capturing channels |
| `buildServices(deps)` | all domain services (bank, categorize, baseline, anomaly, digest, report, mail sync/fullSync/watch, receipt parse/match, delivery, scheduler) |
| `resolveProducer(env, log, app, opts)` | enqueue-only (API + scheduler) |
| `resolveWorkerQueue(env, log, app, opts)` | producer + consumer (workers) |

YAML tunables from `config/*.yaml` flow through `resolveConfig` → mappers in
`@expense/config` → service constructors. There are no code-level defaults for
app tunables; missing YAML keys fail at startup.

---

## Split composition roots (one per process)

Each runnable process has exactly **one** `composition-root.ts`. It does not
duplicate wiring logic — it calls the shared builders with the right options.

### API — `buildApiContainer()`

The HTTP process enqueues work and serves REST. It wires **repos, bank, and
producer only**. No consumer, no LLM, no delivery adapters.

```ts
// apps/api/src/composition-root.ts
export function buildApiContainer(opts: ApiWiringOptions = {}): ApiContainer {
  const { env, app } = resolveConfig(opts);
  const log = makeLogger({ level: env.LOG_LEVEL });
  const clock = opts.clock ?? new FixedClock(/* … */);
  const { repos, prisma } = resolveRepos(env, opts);
  const bank = resolveBank(env, opts);
  const { producer, closeProducer } = resolveProducer(env, log, app, opts);

  return { env, app, log, clock, repos, prisma, bank, producer, closeProducer };
}
```

### Workers — `buildWorkerContainer()`

The worker process runs domain logic. It wires **everything the job handlers
need**: repos, bank, producer, consumer, all six services, LLM, and delivery.

```ts
// apps/workers/src/composition-root.ts
export function buildWorkerContainer(opts: WorkerWiringOptions = {}): WorkerContainer {
  const { env, app } = resolveConfig(opts);
  const log = makeLogger({ level: env.LOG_LEVEL });
  const clock = opts.clock ?? new FixedClock(/* … */);
  const { repos, prisma } = resolveRepos(env, opts);
  const bank = resolveBank(env, opts);
  const { producer, consumer, drain, closeQueue } = resolveWorkerQueue(env, log, app, opts);
  const llm = resolveLlm(env, app, opts);
  const { router, emailChannel } = resolveDelivery(env, log, opts);

  const services = buildServices({ repos, bank, producer, clock, llm, router, app });

  return { env, app, log, clock, repos, prisma, bank, producer, consumer, drain, closeQueue, services, emailChannel };
}
```

### Scheduler — `buildSchedulerContainer()`

The scheduler enqueues weekly digests. It wires **repos + producer** (via
`resolveProducer` with `useBullMQ: true`) and the scheduler domain service.

Read any composition root plus `@expense/wiring` and you read the whole system's
dependency graph. The `LLM_FAKE` and `DELIVERY_DRY_RUN` branches live in
`resolveLlm` / `resolveDelivery` — the only spots that decide real-vs-fake.

---

## Job handlers stay in workers

Workers hold no business logic beyond registration. `job-handlers.ts` maps each
job type to `services.*.run()`:

```ts
// apps/workers/src/job-handlers.ts
export function registerJobHandlers(queue: JobConsumer, services: WorkerServices): void {
  queue.process("txn.sync",           (p) => services.sync.run(p));
  queue.process("txn.categorize",     (p) => services.categorize.run(p));
  queue.process("anomaly.evaluate",   (p) => services.anomaly.run(p));
  queue.process("baseline.recompute", (p) => services.baseline.run(p));
  queue.process("digest.generate",    (p) => services.digest.run(p));
  queue.process("report.generate",    (p) => services.report.run(p));
  queue.process("delivery.send",      (p) => services.delivery.run(p));
  queue.process("mail.sync",          (p) => services.mailSync.run(p));
  queue.process("mail.fullSync",      (p) => services.mailFullSync.run(p));
  queue.process("mail.watch",         (p) => services.mailWatch.run(p));
  queue.process("receipt.parse",      (p) => services.receiptParse.run(p));
  queue.process("receipt.match",      (p) => services.receiptMatch.run(p));
}
```

Add a worker = add one `process` line here + the service in `core`.
Current count: **12 handlers** (bank pipeline: 4, scheduled: 2, delivery: 1,
mail pipeline: 4, receipt pipeline: 1).

---

## Entry points are thin

The process entry point does almost nothing: load config, build the container,
attach handlers/routes, start, and wire graceful shutdown. No business logic, no
adapter knowledge.

```ts
// apps/workers/src/main.ts
async function main() {
  const config = loadConfig();
  const container = buildWorkerContainer({ config, useDatabase: true, useBullMQ: true });

  registerJobHandlers(container.consumer, container.services);
  await container.consumer.start();

  installGracefulShutdown(container.log, async () => {
    await container.consumer.stop();
    await container.closeQueue?.();
  });
}
void main();
```

```ts
// apps/api/src/main.ts
async function main() {
  const config = loadConfig();
  const container = buildApiContainer({ config, useDatabase: true, useBullMQ: true });
  const app = createApp(container);
  app.listen(config.env.API_PORT, () => { /* … */ });
}
void main();
```

---

## Lifecycle & shutdown

Shared clients (Prisma pool, Redis connections, BullMQ workers) are created
once in the container and closed once on shutdown. We register a single
`installGracefulShutdown` that, on `SIGTERM`/`SIGINT`:

1. stops pulling new jobs / accepting new HTTP connections,
2. waits for in-flight work to finish (bounded by a deadline),
3. closes Redis and Prisma,
4. exits.

This is what makes rolling deploys safe: a worker being replaced finishes its
current job instead of dropping it.

```ts
export function installGracefulShutdown(log: Logger, close: () => Promise<void>) {
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.once(sig, async () => {
      log.info("shutting down", { sig });
      await close().catch((e) => log.error("shutdown error", { err: String(e) }));
      process.exit(0);
    });
  }
}
```

---

## Testing uses the same builders

- **Route tests** call `buildApiContainer({ env: makeTestEnv(), app: makeTestAppConfig(), repos, clock })`.
- **E2e heartbeat tests** call `buildWorkerContainer({ … })` with in-memory repos and queue, then `registerJobHandlers` + `drain()`.
- **Domain service unit tests** construct services directly with fakes — no container needed.

Production wiring and test wiring share `@expense/wiring`; tests swap in fakes via options (`repos`, `bank`, `llm`, `useBullMQ: false`).

---

## The rules that keep this clean

- **Adapters are imported only by `@expense/wiring` and app composition roots.**
  If a domain file imports `@expense/plaid` or `@prisma/client`, that is a bug.
  A lint rule enforces this boundary.
- **Each process wires only what it uses.** The API must not construct an LLM
  client or job consumer.
- **Build infrastructure once.** No `new PrismaClient()` scattered in
  repositories; the pool is created in the container and passed down.
- **No singletons / no module-level state.** Everything is constructed in the
  container and injected.
- **Config is parsed once, at the edge.** Factories receive typed config, never
  raw `process.env`. See [conventions.md §4](../conventions.md#4-validation-at-the-boundary-trust-within).

The result: production wiring and test wiring are the *same code path* with
different options plugged in. `@expense/wiring` is the seam, and the per-process
composition roots are the knobs.
