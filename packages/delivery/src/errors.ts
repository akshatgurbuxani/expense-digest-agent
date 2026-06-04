import { InvariantError, UpstreamError } from "@expense/core";

/** Map Resend SDK / HTTP failures into our error taxonomy. */
export function mapResendError(err: unknown): UpstreamError | InvariantError {
  const status = extractStatus(err);
  const code = extractCode(err);

  if (status === 422 || code === "validation_error") {
    return new InvariantError("invalid email recipient or payload", err);
  }
  if (status === 429) {
    return new UpstreamError("resend rate limited", err);
  }
  if (status !== undefined && status >= 500) {
    return new UpstreamError("resend server error", err);
  }

  return new UpstreamError("resend send failed", err);
}

/** Map Twilio SDK failures into our error taxonomy. */
export function mapTwilioError(err: unknown): UpstreamError | InvariantError {
  const status = extractStatus(err);
  const code = extractTwilioCode(err);

  if (code === 21211 || code === 21614 || status === 400) {
    return new InvariantError("invalid sms recipient", err);
  }
  if (status === 429 || code === 20429) {
    return new UpstreamError("twilio rate limited", err);
  }
  if (status !== undefined && status >= 500) {
    return new UpstreamError("twilio server error", err);
  }

  return new UpstreamError("twilio send failed", err);
}

function extractStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { statusCode?: number }).statusCode;
  return typeof status === "number" ? status : undefined;
}

function extractCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const code = (err as { name?: string; code?: string }).code
    ?? (err as { name?: string }).name;
  return typeof code === "string" ? code : undefined;
}

function extractTwilioCode(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const code = (err as { code?: number }).code;
  return typeof code === "number" ? code : undefined;
}
