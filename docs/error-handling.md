# Error Handling

One small taxonomy of errors, one rule for how they propagate, and one place
that decides retry-vs-dead-letter. The goal is that failures are **loud,
typed, and self-classifying** — the queue layer should never have to parse an
error message to know what to do.

---

## The base class

Every error we throw derives from `AppError`. It carries a stable `code` (for
logs/metrics) and a `retryable` flag (for the queue). The original cause is
preserved.

```ts
// packages/core/src/errors.ts
export abstract class AppError extends Error {
  abstract readonly code: string;       // stable, machine-readable
  abstract readonly retryable: boolean; // queue uses this directly
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}
```

## The taxonomy

Five concrete types cover the system. Keep the set small — if a new failure
does not fit one of these, map it into one at the boundary rather than adding a
sixth.

| Error | `code` | `retryable` | Meaning / typical source |
|-------|--------|-------------|--------------------------|
| `InvariantError` | `invariant` | `false` | A "this should be impossible" violation — bad `Money`, unknown registry key, tampered ciphertext, malformed data that passed validation. A bug or corruption; retrying won't help. |
| `ValidationError` | `validation` | `false` | Untrusted input failed its Zod schema — HTTP body, webhook payload, **LLM response**, job payload. Carries the field issues. |
| `UpstreamError` | `upstream` | `true` | A dependency failed transiently — Plaid 5xx/timeout, Anthropic rate limit, Resend/Twilio hiccup, Redis blip. Retrying later may succeed. |
| `NotFoundError` | `not_found` | `false` | A required entity is absent — user, item, transaction. Usually a 404 at the API; in a worker, a non-retryable data problem. |
| `MailHistoryExpiredError` | `mail_history_expired` | `false` | Gmail `history.list` 404 — the start history ID is too old for the Gmail API to process. Triggers a full resync (`mail.fullSync`). Not retryable because retrying with the same expired ID will keep failing. |

```ts
export class InvariantError          extends AppError { readonly code = "invariant";             readonly retryable = false; }
export class ValidationError         extends AppError { readonly code = "validation";            readonly retryable = false;
  constructor(message: string, readonly issues?: unknown, override readonly cause?: unknown) { super(message, cause); } }
export class UpstreamError           extends AppError { readonly code = "upstream";              readonly retryable = true; }
export class NotFoundError           extends AppError { readonly code = "not_found";             readonly retryable = false; }
export class MailHistoryExpiredError extends AppError { readonly code = "mail_history_expired";  readonly retryable = false; }
```

---

## The rule: throw, don't return

The happy path stays unindented. We **throw** typed errors and let them
propagate to the nearest boundary that knows how to handle them (an Express
error middleware, or the queue's job wrapper). Domain code does not litter
itself with `try/catch`; it catches only when it can *add* something — wrap a
vendor error into an `UpstreamError`, or enrich context — and re-throws.

```ts
// adapter boundary: translate vendor failure into our taxonomy
try {
  return await plaid.transactionsSync(req);
} catch (e) {
  if (isPlaidRateLimit(e)) throw new UpstreamError("plaid rate limited", e);
  if (isPlaidItemLogin(e)) { await repo.setStatus(itemId, "needs_reauth"); throw new InvariantError("item needs reauth", e); }
  throw new UpstreamError("plaid sync failed", e);
}
```

Two things to notice: vendor exceptions never escape an adapter un-translated
(the domain only ever sees `AppError`s), and classification happens once, where
the knowledge lives.

---

## Where errors are handled

There are exactly two terminal handlers. Everywhere else, errors propagate.

### 1. The queue job wrapper (workers)

The queue adapter wraps every handler. This single function is the *only* place
that decides retry vs. dead-letter, and it decides purely from `retryable` —
never by string-matching.

```ts
async function runHandler(name, payload, job, handler, log) {
  try {
    await handler(payload, { jobId: job.id, attempt: job.attemptsMade, log });
  } catch (err) {
    const retryable = err instanceof AppError ? err.retryable : true; // unknown = assume transient, retry
    log.error("job failed", { name, jobId: job.id, code: codeOf(err), retryable, attempt: job.attemptsMade });
    if (retryable && job.attemptsMade < MAX_ATTEMPTS) throw err; // BullMQ retries w/ backoff
    await moveToDeadLetter(name, payload, err);                  // exhausted or non-retryable
  }
}
```

- **Retryable + attempts remaining** → rethrow; BullMQ retries with exponential
  backoff.
- **Non-retryable** (bug, bad data, validation) → straight to the dead-letter
  queue. No point burning retries on a deterministic failure.
- **Retryable but exhausted** → dead-letter, with the last error attached.
- **Unknown (non-`AppError`)** → treated as retryable once; if it keeps
  happening it exhausts into the DLQ. We fail safe, not silent.

The dead-letter queue raises an alert (see
[the architecture doc](./expense-digest-architecture.md#reliability--operability)).
A job in the DLQ is a human's problem, with full context attached, never a
disappearance.

### 2. The Express error middleware (API)

One middleware maps `AppError` → HTTP status. Route handlers never build error
responses themselves.

```ts
app.use((err, _req, res, _next) => {
  const status =
    err instanceof ValidationError ? 400 :
    err instanceof NotFoundError   ? 404 :
    err instanceof UpstreamError   ? 502 : 500;
  log.error("request failed", { code: codeOf(err), status });
  res.status(status).json({ error: { code: codeOf(err), message: safeMessage(err) } });
});
```

`safeMessage` never leaks internals or PII to the client; the detail goes to
the log, the client gets the `code`.

---

## Special case: the LLM is untrusted input

A model response that doesn't parse, or returns a category outside the enum, is
a `ValidationError` — exactly like a bad HTTP body. Per
[interfaces.md](./interfaces.md#llmprovider) the LLM adapter may retry once
internally (models are nondeterministic, a reparse often succeeds); a second
failure throws and the job follows the normal retry/DLQ path. We never persist
or act on an unvalidated model response.

---

## What we never do

- **Never swallow.** No empty `catch {}`. If we catch, we re-throw or handle
  meaningfully.
- **Never stringly-type control flow.** Decisions read `err.code` /
  `err.retryable` / `instanceof`, never `err.message.includes(...)`.
- **Never let a vendor exception reach the domain.** Adapters translate at
  their edge.
- **Never lose a job silently.** Every failure ends in a retry, a dead-letter
  with context, or a returned HTTP error — never a void.
