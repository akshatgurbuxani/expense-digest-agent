# Domain Model

The vocabulary the whole codebase speaks. These types live in
`packages/core/src/domain/` and depend on nothing but the primitives from
[conventions.md](./conventions.md) (`Money`, branded ids). They are plain,
`readonly` data — no methods that do I/O, no vendor fields.

The relational shape backing these types is in
[the architecture doc](./expense-digest-architecture.md#data-model). This
document is the in-memory, code-facing view.

---

## Entities

### User

```ts
export interface User {
  readonly id: UserId;
  readonly email: string;
  readonly timezone: string;          // IANA, e.g. "America/Denver"
  readonly digestDay: Weekday;        // 0=Sun … 6=Sat
  readonly digestTime: string;        // "08:00", interpreted in `timezone`
  readonly deliveryPreference: DeliveryPreference;
  readonly createdAt: Date;           // UTC
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type DeliveryPreference = "email" | "sms";
```

### PlaidItem

One bank login. Holds the encrypted access token and the resumable sync
cursor. The token ciphertext never leaves the data layer decrypted except
inside an adapter call.

```ts
export interface Item {
  readonly id: ItemId;
  readonly userId: UserId;
  readonly plaidItemId: string;
  readonly status: ItemStatus;        // "good" | "needs_reauth" | "error"
  readonly syncCursor: string | null; // null = never synced
  readonly lastSyncedAt: Date | null;
}

export type ItemStatus = "good" | "needs_reauth" | "error";
```

The decrypted access token is **not** part of the `Item` domain type. It is
fetched on demand inside the data layer and handed directly to the
`BankProvider` adapter, so it never sits in a long-lived domain object.

### Account

```ts
export interface Account {
  readonly id: AccountId;
  readonly itemId: ItemId;
  readonly userId: UserId;
  readonly plaidAccountId: string;
  readonly name: string;
  readonly type: string;              // "depository" | "credit" | …
  readonly lastSyncedAt: Date | null;
}
```

### Transaction

The central entity. Carries both the raw vendor name and our cleaned name, and
the enrichment results.

```ts
export interface Transaction {
  readonly id: TransactionId;
  readonly accountId: AccountId;
  readonly userId: UserId;
  readonly plaidTransactionId: string; // unique; the idempotency anchor
  readonly amount: Money;
  readonly merchantNameRaw: string;     // "WHOLEFDS MKT #10220"
  readonly merchantName: string | null; // "Whole Foods Market" (after enrich)
  readonly category: Category | null;    // null until categorized
  readonly plaidPfc: string | null;      // Plaid's own category, if provided
  readonly isSubscription: boolean;
  readonly isRecurring: boolean;
  readonly occurredAt: Date;             // UTC
  readonly enrichedAt: Date | null;      // null until categorized
  readonly removedAt: Date | null;       // soft-delete for Plaid "removed"
}
```

### Digest

```ts
export interface Digest {
  readonly id: DigestId;
  readonly userId: UserId;
  readonly weekStart: Date;             // UTC instant of user's local week start
  readonly weekEnd: Date;
  readonly facts: DigestFacts;          // the numbers (see below) — persisted as JSON
  readonly subject: string;             // LLM-written
  readonly content: string;             // LLM-written body
  readonly deliveredAt: Date | null;
}
```

### Anomaly

```ts
export interface Anomaly {
  readonly id: AnomalyId;
  readonly userId: UserId;
  readonly transactionId: TransactionId;
  readonly reason: AnomalyReason;
  readonly severity: Severity;          // "low" | "high"
  readonly detail: string;              // human-readable, pre-computed in code
  readonly detectedAt: Date;
  readonly deliveredAt: Date | null;
}

export type AnomalyReason =
  | "price_increase"
  | "duplicate_charge"
  | "new_subscription"
  | "unusual_spend";

export type Severity = "low" | "high";
```

---

## Value Objects

### Money

Defined in [conventions.md](./conventions.md#1-money-is-an-integer-value-object-never-a-float).
It is the only type in the domain with behavior, because its invariants
(integer minor units, single currency) must hold everywhere.

### Category

A closed enum, not a free string. The LLM is constrained to choose from this
set; an LLM response with an unknown category is rejected at the boundary.
Keeping it closed is what makes baselines and category breakdowns stable.

```ts
export const CATEGORIES = [
  "groceries", "dining", "transport", "subscriptions", "shopping",
  "utilities", "housing", "health", "entertainment", "travel",
  "income", "transfer", "fees", "other",
] as const;

export type Category = (typeof CATEGORIES)[number];
```

### MerchantSignals

What the LLM extracts about a merchant once, cached forever (per merchant).

```ts
export interface MerchantSignals {
  readonly isSubscription: boolean;
  readonly isRecurring: boolean;
  readonly confidence: number;          // 0..1
}
```

### SpendBaseline

Pre-computed rolling statistics per user and category. Read by both the digest
worker (for "vs. your usual") and the anomaly worker (for thresholds). Stored,
not recomputed per job.

```ts
export interface SpendBaseline {
  readonly userId: UserId;
  readonly category: Category;
  readonly period: "weekly" | "monthly";
  readonly mean: Money;
  readonly median: Money;
  readonly stddevMinorUnits: number;    // plain number; it is a spread, not an amount
  readonly sampleCount: number;
  readonly computedAt: Date;
}
```

`stddev` is intentionally a plain number, not `Money`: a standard deviation is
a statistical spread, and treating it as a spendable amount would be a category
error. This is the kind of distinction the docs exist to make explicit.

---

## DigestFacts — the contract object between code and the LLM

This is the most important type in the system. It is **everything quantitative,
fully computed**, handed to the LLM so the model only writes prose. Every
number here is produced by pure functions in `core`; the LLM is forbidden from
producing any number not present in this object, and a validator enforces it
(see [testing.md](./testing.md)).

Note every monetary field is a **pre-formatted string** (`"$432.10"`), not a
`Money` and not a number. By the time facts reach the LLM, arithmetic is over.

```ts
export interface DigestFacts {
  readonly user: { readonly firstName: string | null; readonly currency: CurrencyCode };
  readonly window: { readonly startLabel: string; readonly endLabel: string }; // "May 19", "May 25"

  readonly totalSpend: string;                 // "$1,204.55"
  readonly totalSpendVsBaseline: TrendFact | null;

  readonly categories: ReadonlyArray<{
    readonly category: Category;
    readonly amount: string;                   // "$432.10"
    readonly share: string;                    // "36%"
    readonly vsBaseline: TrendFact | null;     // null while still learning
  }>;

  readonly anomalies: ReadonlyArray<{
    readonly reason: AnomalyReason;
    readonly detail: string;                   // pre-written in code
    readonly amount: string;
  }>;

  readonly matchedReceipts: ReadonlyArray<MatchedReceiptFact>;
  readonly unmatchedReceipts: ReadonlyArray<UnmatchedReceiptFact>;
  readonly chargesMissingReceipts: ReadonlyArray<ChargeMissingReceiptFact>;

  readonly maturity: "learning" | "established"; // gates baseline-relative language
}

export interface TrendFact {
  readonly direction: "up" | "down" | "flat";
  readonly percent: string;                    // "30%"
  readonly baselineAmount: string;             // "$330.00"
}
```

The `maturity` flag is how cold-start is handled honestly: when `"learning"`,
every `vsBaseline` is `null` and the prompt instructs the model to avoid
"compared to usual" language. When `"established"`, the trends are present and
the narrative can lean on them. The model never decides this; code does.

Receipt enrichment fields (`matchedReceipts`, `unmatchedReceipts`,
`chargesMissingReceipts`) are populated from persisted receipts and links —
see [gmail-receipt-enrichment.md](./gmail-receipt-enrichment.md).

---

## MonthlyReportFacts — monthly digest contract

Same money-contract rules as `DigestFacts`, but for a **calendar month** in the
user's timezone. Built by `buildMonthlyReportFacts()` in code; Claude writes
prose via `LlmProvider.writeMonthlyReport()`.

```ts
export interface MonthlyReportFacts {
  readonly user: { readonly firstName: string | null; readonly currency: CurrencyCode };
  readonly window: { readonly monthLabel: string; readonly yearMonth: string }; // "May 2026", "2026-05"
  readonly totalSpend: string;
  readonly categories: ReadonlyArray<{
    readonly category: Category;
    readonly amount: string;
    readonly share: string;
  }>;
  readonly matchedReceipts: ReadonlyArray<MatchedReceiptFact>;
  readonly unmatchedReceipts: ReadonlyArray<UnmatchedReceiptFact>;
  readonly chargesMissingReceipts: ReadonlyArray<ChargeMissingReceiptFact>;
}
```

---

## MonthlyReport

Stored monthly narrative, parallel to `Digest`.

```ts
export interface MonthlyReport {
  readonly id: ReportId;
  readonly userId: UserId;
  readonly yearMonth: string;           // "2026-05"
  readonly monthStart: Date;
  readonly monthEnd: Date;
  readonly facts: MonthlyReportFacts;  // persisted as JSON
  readonly subject: string;
  readonly content: string;
  readonly deliveredAt: Date | null;
}
```

Scheduler enqueues `report.generate` on the 1st at `report.deliveryHour` (user
TZ) for the **previous** calendar month. Idempotency key:
`report:{userId}:{yearMonth}`.

---

## Gmail receipt entities (G1→G10)

Specified in [gmail-receipt-enrichment.md](./gmail-receipt-enrichment.md).
Plaid remains spend source of truth; Gmail adds order context.

### MailAccount

One Gmail connection per user (v1 ships one; schema allows many).

```ts
export interface MailAccount {
  readonly id: MailAccountId;
  readonly userId: UserId;
  readonly gmailAddress: string;
  readonly status: "active" | "needs_reauth" | "revoked" | "error";
  readonly historyId: string | null;      // last processed history.list checkpoint
  readonly watchExpiresAt: Date | null;
  readonly lastSyncedAt: Date | null;
  readonly connectedAt: Date;
}
```

Refresh token ciphertext stays out of this type — fetched via
`MailAccountRepository.withRefreshToken`.

### MailMessage

Audit ledger for idempotent ingest — not a full inbox mirror.

```ts
export type MailProcessingStatus =
  | "seen" | "ignored" | "classified" | "parsed" | "parse_failed" | "matched" | "deleted";

export interface MailMessage {
  readonly id: MailMessageId;
  readonly userId: UserId;
  readonly mailAccountId: MailAccountId;
  readonly gmailMessageId: string;
  readonly threadId: string;
  readonly receivedAt: Date;               // Gmail internalDate
  readonly fromAddress: string;
  readonly fromDomain: string;
  readonly subject: string;
  readonly processingStatus: MailProcessingStatus;
  readonly ignoreReason: string | null;
  readonly receiptKind: ReceiptKind | null;
}
```

### Receipt / TransactionReceiptLink

Structured parse output and optional link to a Plaid transaction. See spec for
`Receipt`, `ReceiptLineItem`, `ReceiptKind`, and `TransactionReceiptLink`.

---

## Why these types live in `core` and nowhere else

Every adapter maps *to and from* these types at its edge:

- The Plaid adapter maps a Plaid transaction → `Transaction`.
- The Prisma repositories map a DB row → `Transaction` and back.
- The LLM adapter maps `DigestFacts` → a prompt, and a model response →
  `{ subject, content }`.

Because the domain types are the lingua franca, no two adapters need to know
about each other, and the domain never learns a vendor's shape. That is the
entire payoff of putting the model here.
