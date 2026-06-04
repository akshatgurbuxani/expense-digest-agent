import type { Clock } from "@expense/core";
import type { Env } from "@expense/config";
import { makeMcpTokenService } from "@expense/config";

/** Mint short-lived MCP tokens for a user (used by the REST API). */
export function makeApiMcpTokens(env: Env, clock: Clock) {
  return makeMcpTokenService({
    secret: env.AUTH_JWT_SECRET,
    clock,
  });
}
