# Registries & Dispatch

> "Smartly load things into a dictionary."

This is the pattern that keeps the codebase flat and growable. Wherever we have
a *family* of things selected at runtime — job handlers, delivery channels,
anomaly detectors, categorization tiers — we put them in a **keyed map (a
registry)** and look them up, instead of writing a `switch` that grows a new
branch every time the family grows.

## Why a dictionary beats a switch

A `switch` ladder couples the dispatcher to every case. Every new case edits
the dispatcher, the dispatcher imports everything, and the file that routes
becomes the file that knows everything. A registry inverts that: each member
*registers itself by key*, the dispatcher just does `registry[key]`, and adding
a member touches one new file plus one registration line.

```ts
// ❌ the switch that rots — every new channel edits this function
function send(pref: string, msg: OutboundMessage) {
  switch (pref) {
    case "email": return sendEmail(msg);
    case "sms":   return sendSms(msg);
    // …and you edit this, and the imports, forever
  }
}

// ✅ the dictionary that grows — dispatch never changes
const channels: Record<DeliveryPreference, DeliveryChannel> = {
  email: emailChannel,
  sms: smsChannel,
};
const send = (pref: DeliveryPreference, msg: OutboundMessage) =>
  (channels[pref] ?? raise(new InvariantError(`no channel: ${pref}`))).send(msg);
```

The payoff is not cleverness — it is the *absence* of cleverness. Dispatch is
one indexed read, forever.

## The shape of a registry

Every registry in this codebase follows the same tiny shape, so they all read
the same. Define it once in `core` and reuse it.

```ts
// packages/core/src/registry.ts
export class Registry<K extends string, V> {
  private readonly map = new Map<K, V>();

  register(key: K, value: V): this {
    if (this.map.has(key)) throw new InvariantError(`duplicate registry key: ${key}`);
    this.map.set(key, value);
    return this; // chainable: r.register(a).register(b)
  }

  get(key: K): V {
    const v = this.map.get(key);
    if (!v) throw new InvariantError(`unknown registry key: ${key}`);
    return v;
  }

  has(key: K): boolean { return this.map.has(key); }
  tryGet(key: K): V | undefined { return this.map.get(key); }
  keys(): K[] { return [...this.map.keys()]; }
  values(): V[] { return [...this.map.values()]; }
}
```

Invariants every registry inherits: **no silent overwrite** (duplicate key
throws — catches double-registration at boot), and **no silent miss** (`get`
throws a typed error). Registration happens once, at composition time, not
lazily mid-request.

---

## Registry #1 — Job handlers (the queue dispatch table)

Workers don't `switch` on job name; they register a handler per job into the
consumer, which is itself a dictionary keyed by job name. The job *names and
payload schemas* are themselves a registry — the single source of truth that
makes `enqueue`/`process` type-safe.

```ts
// packages/queue/src/jobs.ts — the typed job registry (12 schemas)
export const JOB_SCHEMAS = {
  "txn.sync":          z.object({ userId: z.string(), itemId: z.string() }),
  "txn.categorize":    z.object({ userId: z.string(), transactionId: z.string() }),
  "anomaly.evaluate":  z.object({ userId: z.string(), transactionId: z.string() }),
  "baseline.recompute":z.object({ userId: z.string() }),
  "digest.generate":   z.object({ userId: z.string(), isoWeek: z.string() }),
  "report.generate":   z.object({ userId: z.string(), yearMonth: z.string() }),
  "delivery.send":     z.object({ userId: z.string(), kind: z.enum(["digest","anomaly","monthly_report"]), refId: z.string() }),
  "mail.sync":         z.object({ userId: z.string(), mailAccountId: z.string() }),
  "mail.fullSync":     z.object({ userId: z.string(), mailAccountId: z.string() }),
  "mail.watch":        z.object({ userId: z.string(), mailAccountId: z.string() }),
  "receipt.parse":     z.object({ userId: z.string(), mailMessageId: z.string() }),
  "receipt.match":     z.object({ userId: z.string(), receiptId: z.string().optional(), transactionId: z.string().optional() }),
} as const;

export type JobName = keyof typeof JOB_SCHEMAS;
export type JobPayload<K extends JobName> = z.infer<(typeof JOB_SCHEMAS)[K]>;
```

Because the names and schemas live in one map, `JobProducer.enqueue` and
`JobConsumer.process` are generic over `JobName` and the payload type is
inferred — a typo'd job name or a wrong payload shape is a compile error, not a
3am page. Registering a worker is then just:

```ts
// apps/workers/src/job-handlers.ts
consumer.process("txn.sync",            syncHandler);
consumer.process("txn.categorize",      categorizeHandler);
consumer.process("baseline.recompute",  baselineHandler);
consumer.process("anomaly.evaluate",    anomalyHandler);
consumer.process("digest.generate",     digestHandler);
consumer.process("report.generate",     reportHandler);
consumer.process("delivery.send",       deliveryHandler);
consumer.process("mail.sync",           mailSyncHandler);
consumer.process("mail.fullSync",       mailFullSyncHandler);
consumer.process("mail.watch",          mailWatchHandler);
consumer.process("receipt.parse",       receiptParseHandler);
consumer.process("receipt.match",       receiptMatchHandler);
// add a job type => add a schema entry + one process() line. Nothing else moves.
```

---

## Registry #2 — Delivery channels

The `DeliveryRouter` from [interfaces.md](../interfaces.md#deliverychannel--deliveryrouter)
is a `Registry<DeliveryPreference, DeliveryChannel>`. Each channel carries its
own key (`channel.kind`), so registration is self-describing and the router has
no hardcoded list:

```ts
export function makeDeliveryRouter(channels: DeliveryChannel[]): DeliveryRouter {
  const registry = new Registry<DeliveryPreference, DeliveryChannel>();
  for (const c of channels) registry.register(c.kind, c);
  return { routeFor: (pref) => registry.get(pref) };
}
```

Adding push notifications: write `PushChannel implements DeliveryChannel` with
`kind = "push"`, add `"push"` to `DeliveryPreference`, pass it into the array
at the wiring layer (`resolveDelivery` in `@expense/wiring`). The router, the
delivery worker, and every call site are untouched.

---

## Registry #3 — Anomaly detectors (a registry of strategies)

Anomaly detection is a family of independent rules. Each is a small pure
function with a key; the worker runs them all and collects hits. Adding a
detector is adding one entry — the worker loop never changes.

```ts
export interface AnomalyDetector {
  readonly reason: AnomalyReason;       // its registry key
  detect(ctx: DetectionContext): Anomaly | null; // pure: data in, verdict out
}

export const DETECTORS = new Registry<AnomalyReason, AnomalyDetector>()
  .register("price_increase", priceIncreaseDetector)
  .register("duplicate_charge", duplicateChargeDetector)
  .register("new_subscription", newSubscriptionDetector)
  .register("unusual_spend", unusualSpendDetector);

// the worker is trivial and stable:
const hits = DETECTORS.values()
  .map((d) => d.detect(ctx))
  .filter((a): a is Anomaly => a !== null);
```

Each detector is pure (it takes the transaction plus the relevant baseline and
returns a verdict), so each is a one-line unit test. The "complex" behavior —
"detect four kinds of anomaly" — is the *sum* of four simple, separately
testable files. That is the beauty target: complex capability, simple parts.

---

## Registry #4 — The categorization chain (ordered dispatch)

Categorization is not a flat map but an **ordered chain of resolvers**, cheapest
first. Same idea — a list of small strategies — but order matters and we stop at
the first hit. This is how "Plaid PFC → cache → LLM" stays readable and how a
new tier slots in without touching the others.

```ts
export interface CategoryResolver {
  readonly name: string;
  resolve(ctx: ResolveContext): Promise<MerchantEnrichment | null>; // null = "pass, try next"
}

// order encodes cost: cheap deterministic tiers first, LLM last
export const RESOLVER_CHAIN: CategoryResolver[] = [
  plaidPfcResolver,        // free — Plaid already told us
  merchantCacheResolver,   // one indexed read
  llmResolver,             // paid; only reached on a miss, writes back to cache
];

export async function resolveCategory(ctx: ResolveContext): Promise<MerchantEnrichment> {
  for (const resolver of RESOLVER_CHAIN) {
    const hit = await resolver.resolve(ctx);
    if (hit) return hit;
  }
  return FALLBACK_OTHER; // never throw on categorization; "other" is valid
}
```

The escalation ladder from the architecture doc *is* this chain. Cost control
is expressed as ordering, not as conditionals scattered through a function.

---

## Where registries are populated

Registries are filled **once, at wiring time** in `@expense/wiring` / service
factories (see [factories-and-composition.md](./factories-and-composition.md)),
never lazily at call time and never via import side-effects. Boot-time
registration means a missing or duplicate registration fails fast on startup,
not on the unlucky request that first needs it.

## When *not* to reach for a registry

Discipline matters as much as the pattern. Use a plain `if` when:

- There are exactly two stable cases that will never grow (e.g. `digest` vs
  `anomaly` payload — a registry there is ceremony).
- The branches are not interchangeable behind one interface.

A registry earns its place only for an **open, growing family behind a common
contract**. Everywhere else, the boring conditional is the clean choice.
