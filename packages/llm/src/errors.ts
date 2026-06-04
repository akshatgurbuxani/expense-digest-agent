import { UpstreamError, ValidationError } from "@expense/core";

/** Map Anthropic SDK failures into our error taxonomy. */
export function mapAnthropicError(err: unknown): UpstreamError | ValidationError {
  if (err instanceof ValidationError) return err;

  const status = extractStatus(err);
  if (status === 429) {
    return new UpstreamError("anthropic rate limited", err);
  }
  if (status !== undefined && status >= 500) {
    return new UpstreamError("anthropic server error", err);
  }

  return new UpstreamError("anthropic request failed", err);
}

function extractStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const status = (err as { status?: number }).status;
  return typeof status === "number" ? status : undefined;
}

/** Models may succeed on a second attempt — retry once on validation failures. */
export async function withLlmParseRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ValidationError) {
      return await fn();
    }
    throw err;
  }
}

export function validationErrorFromZod(
  message: string,
  zodErr: unknown,
): ValidationError {
  return new ValidationError(message, zodErr);
}
