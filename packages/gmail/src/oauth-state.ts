import { ValidationError } from "@expense/core";
import type { UserId } from "@expense/core";
import { SignJWT, jwtVerify } from "jose";

const STATE_TTL_SEC = 600;

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export interface OAuthStatePayload {
  readonly userId: UserId;
  readonly returnTo?: string;
}

/** Signed OAuth state carrying the initiating user id. */
export async function signOAuthState(
  payload: OAuthStatePayload,
  secret: string,
): Promise<string> {
  return new SignJWT({
    sub: payload.userId,
    ...(payload.returnTo ? { returnTo: payload.returnTo } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SEC}s`)
    .sign(secretKey(secret));
}

export async function verifyOAuthState(
  state: string,
  secret: string,
): Promise<OAuthStatePayload> {
  try {
    const { payload } = await jwtVerify(state, secretKey(secret));
    const userId = payload.sub;
    if (!userId || typeof userId !== "string") {
      throw new ValidationError("invalid OAuth state: missing user id");
    }
    const returnTo =
      typeof payload.returnTo === "string" ? payload.returnTo : undefined;
    return { userId: userId as UserId, returnTo };
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError("invalid or expired OAuth state", undefined, err);
  }
}
