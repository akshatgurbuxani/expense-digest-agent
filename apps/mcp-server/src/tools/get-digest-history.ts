import type { McpToolDeps } from "./types.js";

export async function getDigestHistory(deps: McpToolDeps, limit: number) {
  const rows = await deps.repos.digests.history(deps.userId, limit);
  return rows.map((d) => ({
    id: d.id,
    weekStart: d.weekStart.toISOString(),
    weekEnd: d.weekEnd.toISOString(),
    subject: d.subject,
    delivered: d.deliveredAt !== null,
    totalSpend: d.facts.totalSpend,
  }));
}
