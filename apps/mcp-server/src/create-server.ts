import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CATEGORIES } from "@expense/core";
import { z } from "zod";
import type { McpToolDeps } from "./tools/types.js";
import {
  compareToLastMonth,
  getDigestHistory,
  getSpendingByCategory,
  getSpendingThisWeek,
  listRecentAnomalies,
} from "./tools/index.js";

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** Register tenant-scoped finance tools on an MCP server instance. */
export function registerMcpTools(server: McpServer, deps: McpToolDeps): void {
  server.tool("get_spending_this_week", {}, async () =>
    textResult(await getSpendingThisWeek(deps)),
  );

  server.tool("compare_to_last_month", {}, async () =>
    textResult(await compareToLastMonth(deps)),
  );

  server.tool(
    "get_spending_by_category",
    { category: z.enum(CATEGORIES) },
    async ({ category }) =>
      textResult(await getSpendingByCategory(deps, category)),
  );

  server.tool(
    "list_recent_anomalies",
    { limit: z.number().int().positive().max(50).optional() },
    async ({ limit }) => textResult(await listRecentAnomalies(deps, limit ?? 10)),
  );

  server.tool(
    "get_digest_history",
    { limit: z.number().int().positive().max(50) },
    async ({ limit }) => textResult(await getDigestHistory(deps, limit)),
  );
}

export function createMcpServer(deps: McpToolDeps): McpServer {
  const server = new McpServer({
    name: "expense-digest",
    version: "0.1.0",
  });
  registerMcpTools(server, deps);
  return server;
}
