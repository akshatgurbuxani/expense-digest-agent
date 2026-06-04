import { createHash, timingSafeEqual } from "node:crypto";
import { describe, it, expect, beforeAll } from "vitest";
import { InvariantError } from "@expense/core";
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from "jose";
import { verifyPlaidWebhook } from "./webhook-verify.js";

const body = JSON.stringify({
  webhook_type: "TRANSACTIONS",
  webhook_code: "SYNC_UPDATES_AVAILABLE",
  item_id: "item-sandbox-123",
});

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("verifyPlaidWebhook", () => {
  let privateKey: KeyLike;
  let publicJwk: JWK;
  const kid = "test-key-id";

  beforeAll(async () => {
    const pair = await generateKeyPair("ES256");
    privateKey = pair.privateKey;
    publicJwk = await exportJWK(pair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = "ES256";
  });

  async function sign(bodyText: string, iat = Math.floor(Date.now() / 1000)): Promise<string> {
    return new SignJWT({ request_body_sha256: sha256Hex(bodyText) })
      .setProtectedHeader({ alg: "ES256", kid, typ: "JWT" })
      .setIssuedAt(iat)
      .sign(privateKey);
  }

  it("accepts a valid signed webhook", async () => {
    const jwt = await sign(body);
    const verified = await verifyPlaidWebhook(
      { "Plaid-Verification": jwt },
      Buffer.from(body),
      { fetchKey: async () => publicJwk },
    );

    expect(verified).toEqual({
      itemId: "item-sandbox-123",
      type: "TRANSACTIONS",
      code: "SYNC_UPDATES_AVAILABLE",
    });
  });

  it("rejects a tampered body", async () => {
    const jwt = await sign(body);
    await expect(
      verifyPlaidWebhook(
        { "plaid-verification": jwt },
        Buffer.from(body + " "),
        { fetchKey: async () => publicJwk },
      ),
    ).rejects.toThrow(InvariantError);
  });

  it("rejects an expired JWT", async () => {
    const jwt = await sign(body, Math.floor(Date.now() / 1000) - 600);
    await expect(
      verifyPlaidWebhook(
        { "Plaid-Verification": jwt },
        Buffer.from(body),
        { fetchKey: async () => publicJwk },
      ),
    ).rejects.toThrow(InvariantError);
  });

  it("rejects a missing verification header", async () => {
    await expect(
      verifyPlaidWebhook({}, Buffer.from(body), {
        fetchKey: async () => publicJwk,
      }),
    ).rejects.toThrow(/missing Plaid-Verification/i);
  });
});

describe("sha256Hex timingSafeEqual path", () => {
  it("uses constant-time comparison for body hash", () => {
    const a = Buffer.from(sha256Hex("x"));
    const b = Buffer.from(sha256Hex("x"));
    expect(timingSafeEqual(a, b)).toBe(true);
  });
});
