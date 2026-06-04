import { ValidationError } from "@expense/core";
import type { VerifiedMailPush } from "@expense/core";
import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export interface PubSubPushBody {
  readonly message?: {
    readonly data?: string;
    readonly messageId?: string;
  };
}

export interface GmailPushData {
  readonly emailAddress: string;
  readonly historyId: string;
}

/** Base64URL-decode Pub/Sub message.data → Gmail push payload. */
export function decodeGmailPushData(data: string): GmailPushData {
  if (!data) {
    throw new ValidationError("Pub/Sub message.data is empty");
  }
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const json = Buffer.from(normalized + pad, "base64").toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ValidationError("Pub/Sub message.data is not valid JSON");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("emailAddress" in parsed) ||
    !("historyId" in parsed)
  ) {
    throw new ValidationError("Gmail push payload missing emailAddress or historyId");
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.emailAddress !== "string" ||
    typeof record.historyId !== "string"
  ) {
    throw new ValidationError("Gmail push payload has invalid field types");
  }
  return {
    emailAddress: record.emailAddress,
    historyId: record.historyId,
  };
}

export async function verifyPubSubPushJwt(
  authorizationHeader: string | undefined,
  audience: string,
): Promise<void> {
  if (!audience) return;
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new ValidationError("Pub/Sub push missing Authorization bearer token");
  }
  await jwtVerify(match[1], GOOGLE_JWKS, { audience });
}

export function parsePubSubPushBody(rawBody: Buffer): PubSubPushBody {
  try {
    return JSON.parse(rawBody.toString("utf8")) as PubSubPushBody;
  } catch {
    throw new ValidationError("Pub/Sub push body is not valid JSON");
  }
}

export async function verifyGmailPushNotification(
  headers: Record<string, string>,
  rawBody: Buffer,
  audience: string,
): Promise<VerifiedMailPush> {
  await verifyPubSubPushJwt(headers.authorization ?? headers.Authorization, audience);
  const body = parsePubSubPushBody(rawBody);
  const data = body.message?.data;
  if (typeof data !== "string") {
    throw new ValidationError("Pub/Sub push missing message.data");
  }
  const push = decodeGmailPushData(data);
  return {
    gmailAddress: push.emailAddress,
    historyId: push.historyId,
  };
}

/** Encode a Gmail push payload for tests. */
export function encodeGmailPushData(push: GmailPushData): string {
  return Buffer.from(JSON.stringify(push), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
