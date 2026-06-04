import type { McpToolDeps } from "./types.js";

export async function listRecentAnomalies(deps: McpToolDeps, limit = 10) {
  const rows = await deps.repos.anomalies.listRecent(deps.userId, limit);
  return rows.map((a) => ({
    id: a.id,
    reason: a.reason,
    severity: a.severity,
    detail: a.detail,
    detectedAt: a.detectedAt.toISOString(),
    delivered: a.deliveredAt !== null,
  }));
}
