import type { UserId } from "@expense/core";
import type { Clock } from "@expense/core";
import { makeJwtService } from "./jwt.js";

const API_AUDIENCE = "expense-api";
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

export interface AuthTokenConfig {
  readonly secret: string;
  readonly clock: Clock;
  readonly ttlSeconds?: number;
}

export interface AuthTokenService {
  mint(userId: UserId, opts?: { ttlSeconds?: number }): Promise<string>;
  verify(token: string): Promise<UserId>;
}

/** Session JWT for authenticated REST API requests. */
export function makeAuthTokenService(cfg: AuthTokenConfig): AuthTokenService {
  return makeJwtService({
    secret: cfg.secret,
    clock: cfg.clock,
    audience: API_AUDIENCE,
    defaultTtlSeconds: cfg.ttlSeconds ?? DEFAULT_TTL_SECONDS,
    label: "auth",
  });
}
