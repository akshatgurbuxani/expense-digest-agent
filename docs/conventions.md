# Conventions

The primitives every file in this codebase obeys. These are deliberately few
and deliberately strict. They exist so that reading any file feels like reading
every other file, and so that whole categories of bug are impossible by
construction rather than caught by review.

---

## 1. Money is an integer value object, never a float

Floating point cannot represent money. `0.1 + 0.2 !== 0.3`, and a digest that
is off by a cent is a digest nobody trusts. We represent money as an **integer
count of minor units** (cents for USD) wrapped in a value object so the unit
and currency can never be lost or mixed.

```ts
// packages/core/src/money.ts
export type CurrencyCode = "USD" | "EUR" | "GBP"; // extend as needed

/** An amount in minor units (e.g. cents). Immutable. Never a float. */
export class Money {
  private constructor(
    readonly minorUnits: number, // integer; 1099 === $10.99
    readonly currency: CurrencyCode,
  ) {}

  static of(minorUnits: number, currency: CurrencyCode): Money {
    if (!Number.isInteger(minorUnits)) {
      throw new InvariantError("Money.minorUnits must be an integer");
    }
    return new Money(minorUnits, currency);
  }

  /** Plaid/most APIs give decimal strings like "10.99". Parse exactly. */
  static fromDecimalString(value: string, currency: CurrencyCode): Money {
    // parse without float math: split on the decimal point
    const [whole, frac = ""] = value.trim().split(".");
    const cents = `${frac}00`.slice(0, 2);
    const sign = whole.startsWith("-") ? -1 : 1;
    const minor = Math.abs(Number(whole)) * 100 + Number(cents);
    return Money.of(sign * minor, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.minorUnits + other.minorUnits, this.currency);
  }

  /** Ratio against another amount, as a plain number (for "up 30%"). */
  ratioTo(baseline: Money): number {
    this.assertSameCurrency(baseline);
    return baseline.minorUnits === 0 ? 0 : this.minorUnits / baseline.minorUnits;
  }

  toDecimalString(): string {
    const sign = this.minorUnits < 0 ? "-" : "";
    const abs = Math.abs(this.minorUnits);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new InvariantError(`currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}
```

**Rules.** Arithmetic only ever happens on `Money`, never on raw numbers.
Database columns are integer `minor_units` plus a `currency` column — never a
`float`/`numeric` for amounts we do math on. Money is **only** turned into a
string at the very edge: when it goes into `DigestFacts` for the LLM, or into a
rendered template. The LLM and the templates receive strings; they never see
the integer and never do arithmetic. See [domain-model.md](./domain-model.md)
and the money contract in [the architecture doc](./expense-digest-architecture.md#categorization--the-money-contract).

---

## 2. Identifiers

- **Our primary keys are UUIDv7** — time-sortable, so they index well and sort
  chronologically without a separate `created_at` sort. One helper, used
  everywhere: `newId()`.
- **Vendor identifiers are separate columns**, never our PK. `plaid_item_id`,
  `plaid_transaction_id`, `plaid_account_id` are stored as their own unique
  columns. We never adopt a vendor's id as our identity, because we must be
  able to swap the vendor.
- **Branded id types** prevent passing a `UserId` where an `AccountId` is
  expected:

```ts
// packages/core/src/ids.ts
type Brand<T, B extends string> = T & { readonly __brand: B };
export type UserId = Brand<string, "UserId">;
export type ItemId = Brand<string, "ItemId">;
export type AccountId = Brand<string, "AccountId">;
export type TransactionId = Brand<string, "TransactionId">;
export type DigestId = Brand<string, "DigestId">;
export type AnomalyId = Brand<string, "AnomalyId">;

export const newId = <B extends string>(): Brand<string, B> =>
  uuidv7() as Brand<string, B>;
```

---

## 3. Time

- **Store UTC.** Every timestamp column is `timestamptz`. Domain types carry
  `Date` (always UTC) or ISO strings.
- **Compute in the user's timezone.** Any "this week" / "this month" window is
  computed in the user's IANA timezone with **Luxon**, so DST transitions and
  offsets are correct. A user's Sunday 8am is their local Sunday 8am.
- **Time is injected, never read from the ambient clock** in domain code. The
  `Clock` port (see [interfaces.md](./interfaces.md)) provides `now()`. This is
  what makes "is a digest due?" and "is this a duplicate within 1 hour?"
  testable.

```ts
// the only place we ask "what is now": the injected Clock
const now = clock.now();
const window = weekWindowFor(user.timezone, user.digestDay, user.digestTime, now);
```

---

## 4. Validation at the boundary, trust within

Every byte entering the system is validated **once, at the boundary**, with a
Zod schema. Past that boundary, types are trusted — no defensive re-checking in
the middle of the domain.

Boundaries that must validate:

- Environment variables (`packages/config`)
- HTTP request bodies/params (`apps/api`)
- Plaid webhook payloads (`packages/plaid`)
- Every queue job payload, on both enqueue and process (`packages/queue`)
- Every LLM response, parsed against an expected schema (`packages/llm`)

```ts
// pattern: schema is the single source; the TS type is derived from it
export const CategorizeJob = z.object({
  userId: z.string(),
  transactionId: z.string(),
});
export type CategorizeJob = z.infer<typeof CategorizeJob>;
```

The LLM rule is worth stating loudly: **an LLM response is untrusted input.**
It is parsed against a Zod schema and rejected on mismatch exactly like a
user-supplied HTTP body.

---

## 5. Errors are thrown, typed, and classified

We throw typed errors derived from a small base class. We do not return
error-tuples through the domain; the happy path stays unindented and readable.
Each error declares whether it is **retryable**, which is what lets the queue
layer decide retry-vs-dead-letter without inspecting messages. Full taxonomy in
[error-handling.md](./error-handling.md).

```ts
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly retryable: boolean;
  constructor(message: string, readonly cause?: unknown) { super(message); }
}
export class InvariantError extends AppError { code = "invariant"; retryable = false as const; }
export class UpstreamError extends AppError { code = "upstream"; retryable = true as const; }
```

---

## 6. Functions take a dependencies object, not positional services

Domain services receive their dependencies as a single typed `deps` object.
This is our dependency injection — no DI framework, no decorators, no global
container. It reads cleanly, mocks trivially, and the dependency list is
self-documenting.

```ts
interface CategorizeDeps {
  txns: TransactionRepository;
  merchants: MerchantCategoryRepository;
  llm: LlmProvider;
  queue: JobProducer;
  clock: Clock;
  log: Logger;
}

export function makeCategorizeService(deps: CategorizeDeps) {
  return {
    async categorize(userId: UserId, txnId: TransactionId): Promise<void> {
      /* uses deps.* only — never imports a vendor or a singleton */
    },
  };
}
```

Why a factory function returning an object instead of a class? Because there is
no inheritance to model, the closure captures `deps` once, and the result is
trivially fakeable. Classes are reserved for value objects with invariants
(like `Money`).

---

## 7. Immutability and purity

- Domain types are `readonly`. We never mutate an entity in place; we construct
  a new one. This makes reasoning local and removes a class of aliasing bugs.
- Domain **services are pure** with respect to I/O: all I/O goes through
  injected ports. A domain service never calls `fetch`, `new PrismaClient()`,
  `Date.now()`, or `process.env`.
- Pure computation (window math, totals, baselines, anomaly scoring) lives in
  standalone functions in `core` that take data and return data. These are the
  easiest things in the codebase to test, so the most important logic lives
  there.

---

## 8. Naming

| Thing | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `categorize-service.ts` |
| Types / classes / interfaces | PascalCase | `LlmProvider`, `Money` |
| Functions / variables | camelCase | `weekWindowFor` |
| Port interfaces | noun describing capability | `BankProvider`, not `IPlaid` |
| Adapter implementations | `<Vendor><Port>` | `PlaidBankProvider`, `ResendEmailChannel` |
| Factories | `make<Thing>` | `makeCategorizeService`, `makeBankProvider` |
| Registries | `<thing>Registry` | `jobHandlerRegistry` |
| Zod schema + its type | same name | `CategorizeJob` (schema) / `CategorizeJob` (type) |

No `I`-prefixed interfaces, no `Impl` suffixes. The port is named for what it
does; the adapter is named for who does it.

---

## 9. Async

- Everything I/O-bound is `async`/`await`. No raw `.then()` chains.
- Concurrency is **bounded explicitly** anywhere it touches a rate-limited
  resource (the LLM, Plaid). We never fan out unbounded `Promise.all` over a
  vendor call; we use a small concurrency limiter.
- No floating promises. Every promise is awaited or explicitly handed to a
  queue. Lint enforces `no-floating-promises`.

---

## 10. What a clean file looks like here

A source file in this project should be skimmable top-to-bottom in under a
minute:

1. imports (workspace + std before vendors)
2. the schema(s) / types it owns
3. one exported factory or function
4. small private helpers below it

If a file needs a comment to explain *what* it does, the file is probably doing
too much; split it. Comments are reserved for *why* — a non-obvious constraint,
a vendor quirk, a deliberate trade-off. Never narrate the code.
