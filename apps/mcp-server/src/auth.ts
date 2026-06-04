import type { UserId } from "@expense/core";
import { ValidationError } from "@expense/core";
import type { McpTokenService } from "@expense/config";

/** Resolve the authenticated user from the process MCP access token. */
export async function resolveMcpUserId(
  tokens: McpTokenService,
  rawToken: string | undefined,
): Promise<UserId> {
  if (!rawToken || rawToken.length === 0) {
    throw new ValidationError("MCP_ACCESS_TOKEN is required");
  }
  return tokens.verify(rawToken);
}
