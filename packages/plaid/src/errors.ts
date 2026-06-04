import { InvariantError, UpstreamError } from "@expense/core";

interface PlaidErrorBody {
  readonly error_type?: string;
  readonly error_code?: string;
  readonly error_message?: string;
}

/** Map Plaid SDK / HTTP failures into our error taxonomy. */
export function mapPlaidError(err: unknown): UpstreamError | InvariantError {
  const body = extractPlaidErrorBody(err);
  if (!body) {
    return new UpstreamError("plaid request failed", err);
  }

  const code = body.error_code ?? "unknown";
  if (code === "RATE_LIMIT_EXCEEDED") {
    return new UpstreamError("plaid rate limited", err);
  }
  if (code === "ITEM_LOGIN_REQUIRED") {
    return new InvariantError("item needs reauth", err);
  }
  if (body.error_type === "API_ERROR") {
    return new UpstreamError(body.error_message ?? "plaid api error", err);
  }

  return new UpstreamError(`plaid ${code}`, err);
}

function extractPlaidErrorBody(err: unknown): PlaidErrorBody | null {
  if (typeof err !== "object" || err === null) return null;
  const response = (err as { response?: { data?: unknown } }).response;
  const data = response?.data;
  if (typeof data !== "object" || data === null) return null;
  return data as PlaidErrorBody;
}
