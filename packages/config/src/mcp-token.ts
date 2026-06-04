import type { UserId } from "@expense/core";
import type { Clock } from "@expense/core";
import { makeJwtService } from "./jwt.js";

const MCP_AUDIENCE = "expense-mcp";
const DEFAULT_TTL_SECONDS = 15 * 60;

export interface McpTokenConfig {
  readonly secret: string;
  readonly clock: Clock;
  readonly ttlSeconds?: number;
}

export interface McpTokenService {
  mint(userId: UserId, opts?: { ttlSeconds?: number }): Promise<string>;
  verify(token: string): Promise<UserId>;
}

/** Short-lived per-user JWT for MCP tool scoping. */
export function makeMcpTokenService(cfg: McpTokenConfig): McpTokenService {
  return makeJwtService({
    secret: cfg.secret,
    clock: cfg.clock,
    audience: MCP_AUDIENCE,
    defaultTtlSeconds: cfg.ttlSeconds ?? DEFAULT_TTL_SECONDS,
    label: "mcp",
  });
}
