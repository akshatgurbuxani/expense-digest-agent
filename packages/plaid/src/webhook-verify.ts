import { createHash, timingSafeEqual } from "node:crypto";
import { InvariantError, UpstreamError } from "@expense/core";
import type { VerifiedWebhook } from "@expense/core";
import {
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
  type JWK,
} from "jose";

const MAX_AGE_SEC = 5 * 60;

export interface WebhookVerifyDeps {
  fetchKey: (keyId: string) => Promise<JWK>;
}

interface WebhookJwtPayload {
  readonly iat: number;
  readonly request_body_sha256: string;
}

interface PlaidWebhookBody {
  readonly item_id: string;
  readonly webhook_type: string;
  readonly webhook_code: string;
}

/** Verify a Plaid webhook JWT and return routing facts only. */
export async function verifyPlaidWebhook(
  headers: Record<string, string>,
  rawBody: Buffer,
  deps: WebhookVerifyDeps,
): Promise<VerifiedWebhook> {
  const token = getHeader(headers, "plaid-verification");
  if (!token) {
    throw new InvariantError("missing Plaid-Verification header");
  }

  let header;
  try {
    header = decodeProtectedHeader(token);
  } catch (err) {
    throw new InvariantError("invalid Plaid-Verification JWT header", err);
  }

  if (header.alg !== "ES256") {
    throw new InvariantError(`unsupported webhook JWT alg: ${String(header.alg)}`);
  }
  if (!header.kid) {
    throw new InvariantError("webhook JWT missing kid");
  }

  let jwk: JWK;
  try {
    jwk = await deps.fetchKey(header.kid);
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError("failed to fetch Plaid webhook verification key", err);
  }

  let payload: WebhookJwtPayload;
  try {
    const key = await importJWK(jwk, "ES256");
    const verified = await jwtVerify(token, key, {
      algorithms: ["ES256"],
      maxTokenAge: `${MAX_AGE_SEC} sec`,
    });
    payload = verified.payload as unknown as WebhookJwtPayload;
  } catch (err) {
    throw new InvariantError("invalid Plaid webhook signature", err);
  }

  const bodyHash = sha256Hex(rawBody);
  if (!safeEqualHex(bodyHash, payload.request_body_sha256)) {
    throw new InvariantError("webhook body hash mismatch");
  }

  let body: PlaidWebhookBody;
  try {
    body = JSON.parse(rawBody.toString("utf8")) as PlaidWebhookBody;
  } catch (err) {
    throw new InvariantError("webhook body is not valid JSON", err);
  }

  if (!body.item_id || !body.webhook_type || !body.webhook_code) {
    throw new InvariantError("webhook body missing routing fields");
  }

  return {
    itemId: body.item_id,
    type: body.webhook_type,
    code: body.webhook_code,
  };
}

function getHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

function sha256Hex(rawBody: Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
