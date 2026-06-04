/**
 * The error taxonomy. Every thrown error derives from `AppError` and carries a
 * stable `code` (for logs/metrics) and a `retryable` flag the queue layer uses
 * to decide retry-vs-dead-letter without inspecting messages.
 *
 * See docs/error-handling.md.
 */
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly retryable: boolean;

  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** "This should be impossible" — bad invariant, corruption, unknown key. */
export class InvariantError extends AppError {
  readonly code = "invariant";
  readonly retryable = false;
}

/** Untrusted input failed its schema — HTTP body, webhook, LLM response, job. */
export class ValidationError extends AppError {
  readonly code = "validation";
  readonly retryable = false;

  constructor(
    message: string,
    readonly issues?: unknown,
    cause?: unknown,
  ) {
    super(message, cause);
  }
}

/** A dependency failed transiently — Plaid/Anthropic/Resend/Redis hiccup. */
export class UpstreamError extends AppError {
  readonly code = "upstream";
  readonly retryable = true;
}

/** Gmail history.list startHistoryId is no longer valid — enqueue mail.fullSync. */
export class MailHistoryExpiredError extends AppError {
  readonly code = "mail_history_expired";
  readonly retryable = false;
}

/** A required entity is absent — user, item, transaction. */
export class NotFoundError extends AppError {
  readonly code = "not_found";
  readonly retryable = false;
}
