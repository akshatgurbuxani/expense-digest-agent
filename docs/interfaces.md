# Interfaces (Ports)

Every port the domain depends on, as a full TypeScript interface plus its
behavioral contract. A signature alone is half a spec; the **contract**
(invariants, idempotency, failure modes) is the other half and is binding on
every adapter that implements it.

All ports live in `packages/core/src/ports/`. Adapters live in their own
package and are named `<Vendor><Port>` (see
[conventions.md](./conventions.md#8-naming)).

General rules for every port:

- Methods are `async` and return domain types (from
  [domain-model.md](./domain-model.md)), never vendor types.
- Methods throw typed `AppError`s (see [error-handling.md](./error-handling.md));
  they never return error tuples.
- Anything tenant-owned takes a `UserId` and is scoped to it.

---

## Cross-cutting ports

### Clock

```ts
export interface Clock {
  now(): Date; // always UTC
}
```
**Contract.** The single source of "now" for domain code. Production adapter
returns `new Date()`. Tests inject a `FixedClock` they can advance. No domain
file calls `Date.now()` directly.

### Logger

```ts
export interface Logger {
  child(bindings: Record<string, unknown>): Logger;
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}
```
**Contract.** Structured only — no string interpolation of data into the
message. Every worker creates a `child({ jobId, userId })` so every line is
traceable to a tenant and a job. Backed by pino.

### Crypto

```ts
export interface Crypto {
  encrypt(plaintext: string): string;  // returns opaque ciphertext (base64)
  decrypt(ciphertext: string): string;
}
```
**Contract.** Authenticated symmetric encryption (AES-256-GCM) with a key from
config, held outside the database. Used for Plaid access tokens. `decrypt`
throws `InvariantError` on tamper/auth failure — a corrupt token is never
silently treated as empty.

---

## BankProvider

The whole surface we need from a bank-data vendor. Implemented by
`PlaidBankProvider`.

```ts
export interface BankProvider {
  createLinkToken(userId: UserId): Promise<{ linkToken: string; expiration: Date }>;

  exchangePublicToken(publicToken: string): Promise<{
    plaidItemId: string;
    accessToken: string;     // caller encrypts immediately; never logged
  }>;

  syncTransactions(input: {
    accessToken: string;
    cursor: string | null;   // null on first sync
  }): Promise<SyncPage>;

  verifyWebhook(headers: Record<string, string>, rawBody: Buffer): Promise<VerifiedWebhook>;
}

export interface SyncPage {
  readonly added: RawTransaction[];
  readonly modified: RawTransaction[];
  readonly removed: string[];          // plaid_transaction_ids
  readonly nextCursor: string;
  readonly hasMore: boolean;
}

export interface VerifiedWebhook {
  readonly itemId: string;             // plaid_item_id
  readonly type: string;               // e.g. "TRANSACTIONS"
  readonly code: string;               // e.g. "SYNC_UPDATES_AVAILABLE"
}
```

**Contract.**

- `syncTransactions` is the only way transactions enter the system. The caller
  loops on `hasMore`, advancing `cursor` to `nextCursor`, persisting each page
  before advancing. The adapter does not loop internally — paging is the sync
  worker's job, so a crash mid-loop is resumable.
- `RawTransaction` is the adapter's edge type; it is mapped to the domain
  `Transaction` by the sync worker. `core` never sees a Plaid shape.
- `verifyWebhook` performs full JWT signature verification against Plaid's
  rotating keys and throws `UpstreamError` (retryable) on key-fetch failure,
  `InvariantError` (not retryable) on a genuinely bad signature. It returns
  *only* the routing facts — never trusts the body for data.
- `exchangePublicToken` returns a plaintext access token exactly once; the
  caller must encrypt before persisting. The token must never be logged.

---

## LlmProvider

Three LLM jobs in the system. Implemented by `ClaudeLlmProvider` and by
`FakeLlmProvider` (deterministic, for tests/local).

```ts
export interface LlmProvider {
  categorizeMerchant(input: {
    rawName: string;
    plaidPfc: string | null;          // hint, if Plaid gave one
    amountHint: string;               // pre-formatted; context only
  }): Promise<MerchantEnrichment>;

  writeDigest(facts: DigestFacts): Promise<{ subject: string; body: string }>;

  writeMonthlyReport(
    facts: MonthlyReportFacts,
  ): Promise<{ subject: string; body: string }>;
}

export interface MerchantEnrichment {
  readonly merchantName: string;      // cleaned, human-readable
  readonly category: Category;        // MUST be one of CATEGORIES
  readonly signals: MerchantSignals;
}
```

**Contract.**

- Both methods **validate the model's response against a Zod schema** before
  returning. An unparseable response or an out-of-enum `category` throws
  `UpstreamError` (retryable once) — the model output is untrusted input.
- `writeDigest` and `writeMonthlyReport` receive only pre-formatted facts structs
  (`DigestFacts`, `MonthlyReportFacts`). The adapter's prompt explicitly forbids
  inventing or recomputing numbers, and the returned prose is later checked by
  the money-contract validator (see [testing.md](./testing.md)). The adapter
  itself does no arithmetic.
- Calls are made under a **bounded concurrency limiter** owned by the adapter,
  so load never exceeds the provider's rate limit regardless of queue depth.
- `FakeLlmProvider` implements the identical contract deterministically: it
  title-cases the raw name, maps via a small fixed table, and renders a
  template digest. No code outside this package knows whether the LLM is real.

---

## DeliveryChannel & DeliveryRouter

One method per channel; a router selects the channel.

```ts
export interface DeliveryChannel {
  readonly kind: DeliveryPreference;  // "email" | "sms" — its registry key
  send(message: OutboundMessage): Promise<DeliveryResult>;
}

export interface OutboundMessage {
  readonly to: string;                // email or E.164 phone
  readonly subject: string;           // ignored by SMS
  readonly body: string;              // HTML for email, text for SMS
}

export interface DeliveryResult {
  readonly providerMessageId: string;
  readonly sentAt: Date;
}

export interface DeliveryRouter {
  routeFor(pref: DeliveryPreference): DeliveryChannel; // throws if unregistered
}
```

**Contract.**

- A channel knows nothing about digests or anomalies — only how to send a
  generic `OutboundMessage`. Content is built upstream.
- The router is a registry keyed by `kind` (see
  [registries-and-dispatch.md](./patterns/registries-and-dispatch.md)). Adding
  push notifications is: implement `DeliveryChannel`, register it, done.
- `send` throws `UpstreamError` (retryable) on transient provider failure so
  the delivery job retries; a permanently bad recipient throws `InvariantError`
  so the job dead-letters instead of looping.
- A `DryRunChannel` implements the interface and only logs — used locally so we
  never send real email/SMS in dev.

---

## JobProducer & Queue

Typed publish/subscribe. The producer side is injected into domain services;
the consumer side is wired in worker entry points. This is the **callback
boundary** of the system — producers emit, they never call consumers.

```ts
// Producer side — injected into domain code
export interface JobProducer {
  enqueue<K extends JobName>(
    name: K,
    payload: JobPayload<K>,
    opts?: EnqueueOptions,
  ): Promise<void>;
}

export interface EnqueueOptions {
  jobId?: string;          // set for idempotency, e.g. digest:{userId}:{isoWeek}
  delayMs?: number;
}

// Consumer side — used only in worker entry points
export interface JobConsumer {
  process<K extends JobName>(name: K, handler: JobHandler<K>): void;
  start(): Promise<void>;
  stop(): Promise<void>;  // graceful: finish in-flight, stop pulling
}

export type JobHandler<K extends JobName> = (
  payload: JobPayload<K>,
  ctx: JobContext,
) => Promise<void>;

export interface JobContext {
  readonly jobId: string;
  readonly attempt: number;
  readonly log: Logger;
}
```

`JobName` and `JobPayload<K>` come from the typed job registry in
`packages/queue` — a single map from job name to its Zod schema. See
[registries-and-dispatch.md](./patterns/registries-and-dispatch.md#the-job-registry).

**Contract.**

- `enqueue` validates `payload` against the job's schema before publishing;
  `process` validates again on receipt. A payload can never be malformed in
  flight.
- Passing `jobId` makes enqueue idempotent — BullMQ rejects a duplicate id.
  This is how the scheduler guarantees one digest per user per week.
- Handlers are `async` and throw on failure; the queue adapter translates a
  thrown `AppError.retryable` into retry-with-backoff, and a non-retryable
  error (or exhausted retries) into a move to the dead-letter queue.
- `stop()` is graceful for clean deploys: stop accepting new jobs, let in-flight
  ones finish.

---

## Repository ports

All repositories are tenant-scoped: tenant-owned reads/writes require a
`UserId`, and the adapter adds `where userId = …` so a caller cannot
accidentally cross tenants. Implemented by Prisma-backed adapters in
`packages/db`.

```ts
export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findDueForDigest(at: Date): Promise<User[]>;   // scheduler uses this
  findDueForMonthlyReport(
    at: Date,
    schedule: ReportScheduleConfig,
  ): Promise<User[]>;
  updatePreferences(id: UserId, prefs: Partial<UserPreferences>): Promise<void>;
}

export interface ItemRepository {
  create(item: NewItem, accessTokenPlaintext: string): Promise<Item>; // encrypts inside
  findById(id: ItemId): Promise<Item | null>;
  findByPlaidItemId(plaidItemId: string): Promise<Item | null>;        // webhook routing
  listByUserId(userId: UserId): Promise<Item[]>;                       // setup status / onboarding
  withAccessToken<T>(id: ItemId, fn: (token: string) => Promise<T>): Promise<T>; // decrypt scoped to callback
  saveCursor(id: ItemId, cursor: string, syncedAt: Date): Promise<void>;
  setStatus(id: ItemId, status: ItemStatus): Promise<void>;
}

export interface TransactionRepository {
  upsertMany(userId: UserId, txns: Transaction[]): Promise<{ insertedIds: TransactionId[] }>;
  softDeleteByPlaidIds(userId: UserId, plaidIds: string[]): Promise<void>;
  findById(userId: UserId, id: TransactionId): Promise<Transaction | null>;
  saveEnrichment(userId: UserId, id: TransactionId, e: Enrichment): Promise<void>;
  listInWindow(userId: UserId, start: Date, end: Date): Promise<Transaction[]>;
  recentForMerchant(userId: UserId, merchant: string, since: Date): Promise<Transaction[]>;
}

export interface MerchantCategoryRepository {
  lookup(normalizedMerchant: string): Promise<CachedMerchant | null>;
  upsert(entry: CachedMerchant): Promise<void>;
}

export interface BaselineRepository {
  get(userId: UserId, category: Category, period: Period): Promise<SpendBaseline | null>;
  getAll(userId: UserId, period: Period): Promise<SpendBaseline[]>;
  upsertMany(userId: UserId, baselines: SpendBaseline[]): Promise<void>;
}

export interface DigestRepository {
  create(digest: Digest): Promise<void>;
  markDelivered(id: DigestId, at: Date): Promise<void>;
  history(userId: UserId, limit: number): Promise<Digest[]>;
}

export interface ReportRepository {
  create(report: MonthlyReport): Promise<void>;
  markDelivered(id: ReportId, at: Date): Promise<void>;
  findById(userId: UserId, id: ReportId): Promise<MonthlyReport | null>;
  findByYearMonth(userId: UserId, yearMonth: string): Promise<MonthlyReport | null>;
}

export interface AnomalyRepository {
  create(anomaly: Anomaly): Promise<void>;
  markDelivered(id: AnomalyId, at: Date): Promise<void>;
  listUndeliveredInWindow(userId: UserId, start: Date, end: Date): Promise<Anomaly[]>;
  listRecent(userId: UserId, limit: number): Promise<Anomaly[]>;
}
```

**Notable contracts.**

- `ItemRepository.withAccessToken(id, fn)` is how decryption stays contained:
  the plaintext token exists only inside `fn`'s scope (which calls the
  `BankProvider`), never as a returned value that could be logged or stored.
- `TransactionRepository.upsertMany` keys on `plaid_transaction_id`. Re-running
  a sync is a no-op for already-seen transactions, and it reports which ids
  were genuinely new so the sync worker knows what to enqueue for
  categorization.
- `UserRepository.findDueForDigest(at)` encapsulates the "whose local digest
  time is now" query so the scheduler stays trivial.

---

## MailProvider

Gmail connectivity and incremental sync. Implemented by `GmailMailProvider` in
`@expense/gmail`. Full behavioral notes in
[gmail-receipt-enrichment.md §3.1, §6.1](./gmail-receipt-enrichment.md).

```ts
export interface VerifiedMailPush {
  readonly gmailAddress: string;
  readonly historyId: string; // notification checkpoint — not startHistoryId
}

export interface RawMailMetadata {
  readonly gmailMessageId: string;
  readonly threadId: string;
  readonly receivedAt: Date; // from Gmail internalDate
  readonly fromAddress: string;
  readonly subject: string;
  readonly snippet: string | null;
  readonly labelIds: readonly string[];
}

export interface RawMailBody {
  readonly gmailMessageId: string;
  readonly textPlain: string | null;
  readonly textHtml: string | null;
}

export interface MailChangePage {
  readonly candidateMessageIds: readonly string[];
  readonly deletedMessageIds: readonly string[];
  readonly nextHistoryId: string;
}

export interface MailListPage {
  readonly messageIds: readonly string[];
  readonly nextPageToken: string | null;
}

export interface MailProvider {
  createAuthUrl(input: {
    userId: UserId;
    redirectUri: string;
    forceConsent?: boolean;
    returnTo?: string;              // signed into OAuth state; callback redirect target
  }): Promise<{ url: string }>;

  exchangeAuthCode(input: { code: string; redirectUri: string }): Promise<{
    gmailAddress: string;
    refreshToken: string;
  }>;

  watchMailbox(input: {
    refreshToken: string;
    topicName: string;
    labelIds?: readonly string[];
    labelFilterBehavior?: "INCLUDE" | "EXCLUDE";
  }): Promise<{ historyId: string; expiration: Date }>;

  stopMailbox(input: { refreshToken: string }): Promise<void>;
  revokeAccess(input: { refreshToken: string }): Promise<void>;

  verifyPushNotification(
    headers: Record<string, string>,
    rawBody: Buffer,
  ): Promise<VerifiedMailPush>;

  listChanges(input: {
    refreshToken: string;
    startHistoryId: string;
    labelId?: string;
  }): Promise<MailChangePage>;

  listRecentMessageIds(input: {
    refreshToken: string;
    query: string;
    maxResults?: number;
    pageToken?: string;
  }): Promise<MailListPage>;

  getMessageMetadata(input: {
    refreshToken: string;
    gmailMessageId: string;
  }): Promise<RawMailMetadata>;

  getMessageBody(input: {
    refreshToken: string;
    gmailMessageId: string;
  }): Promise<RawMailBody>;
}
```

**Contract.**

- `verifyPushNotification` validates the **Pub/Sub OIDC JWT** (`Authorization`
  header) when configured, then Base64URL-decodes `message.data` to
  `{ emailAddress, historyId }`. This is not Plaid-style body signing.
- `listChanges` maps `messagesAdded`, `labelsAdded` (when INBOX gained),
  `labelsRemoved`, and `messagesDeleted` into `candidateMessageIds` /
  `deletedMessageIds`. Throws a typed error mapped from HTTP 404 when
  `startHistoryId` is expired — caller enqueues `mail.fullSync`.
- `getMessageMetadata` / `getMessageBody` never log message content.
- Refresh tokens are passed in by the service inside `withRefreshToken` — same
  containment pattern as `ItemRepository.withAccessToken`.
- `createAuthUrl` requests `gmail.readonly`, `access_type=offline`, and
  `prompt=consent` when `forceConsent` is true.

---

## ReceiptExtractor

Separate from `LlmProvider`. Implemented by `ClaudeReceiptExtractor`. See
[gmail-receipt-enrichment.md §6.2](./gmail-receipt-enrichment.md).

```ts
export interface ReceiptExtractor {
  extract(input: ReceiptExtractionInput): Promise<ReceiptExtractionResult>;
}
```

**Contract.** Extracted monetary fields must pass the same validation as digest
facts — no invented totals.

---

## Mail & receipt repositories

Scoped by `userId` on every query. Implemented in-memory for unit tests; Prisma adapters in `packages/db` (G4).

```ts
export interface MailAccountRepository {
  create(account: NewMailAccount, refreshTokenPlaintext: string): Promise<MailAccount>;
  findById(id: MailAccountId): Promise<MailAccount | null>;
  findByUserId(userId: UserId): Promise<MailAccount | null>;
  findByGmailAddress(gmailAddress: string): Promise<MailAccount | null>;
  listActive(): Promise<readonly MailAccount[]>;
  withRefreshToken<T>(id: MailAccountId, fn: (refreshToken: string) => Promise<T>): Promise<T>;
  saveRefreshToken(id: MailAccountId, refreshTokenPlaintext: string): Promise<void>;
  saveHistoryId(id: MailAccountId, historyId: string, syncedAt: Date): Promise<void>;
  saveWatchExpiration(id: MailAccountId, expiresAt: Date, historyId: string): Promise<void>;
  setStatus(id: MailAccountId, status: MailAccountStatus): Promise<void>;
}

export interface MailMessageRepository {
  findByGmailMessageId(userId: UserId, mailAccountId: MailAccountId, gmailMessageId: string): Promise<MailMessage | null>;
  findById(userId: UserId, id: MailMessageId): Promise<MailMessage | null>;
  upsertSeen(input: UpsertMailMessage): Promise<MailMessage>;
  updateClassification(userId: UserId, id: MailMessageId, update: MailMessageClassificationUpdate): Promise<void>;
  markDeleted(userId: UserId, mailAccountId: MailAccountId, gmailMessageId: string): Promise<void>;
}

export interface ReceiptRepository {
  create(receipt: Receipt): Promise<void>;
  findById(userId: UserId, id: ReceiptId): Promise<Receipt | null>;
  findByMailMessageId(userId: UserId, mailMessageId: MailMessageId): Promise<Receipt | null>;
  listUnmatchedInWindow(userId: UserId, start: Date, end: Date): Promise<Receipt[]>;
}

export interface TransactionReceiptLinkRepository {
  link(entry: TransactionReceiptLink): Promise<void>;
  findByTransactionId(userId: UserId, transactionId: TransactionId): Promise<TransactionReceiptLink | null>;
  findByReceiptId(userId: UserId, receiptId: ReceiptId): Promise<TransactionReceiptLink | null>;
}
```

**Contract.**

- `withRefreshToken` mirrors `ItemRepository.withAccessToken` — plaintext refresh token never returned from repo methods.
- `upsertSeen` is idempotent on `(userId, mailAccountId, gmailMessageId)`.
- `link` throws `InvariantError` if either transaction or receipt is already linked (1:1).
- `listUnmatchedInWindow` returns receipts with no `TransactionReceiptLink` in the date range.

---

## How the ports compose

Nothing here references a concrete vendor. A domain service like the
categorize service declares exactly the ports it needs in its `deps`
([conventions.md §6](./conventions.md#6-functions-take-a-dependencies-object-not-positional-services)),
and `@expense/wiring`
([factories-and-composition.md](./patterns/factories-and-composition.md))
hands it real adapters. Swap any adapter and the domain does not change a line —
which is the property this whole document exists to guarantee.
