/** Append Gmail `after:YYYY/MM/DD` to scope messages.list backfill window. */
export function fullSyncQueryWithBackfill(
  baseQuery: string,
  backfillDays: number,
  now: Date,
): string {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - backfillDays);
  const y = start.getUTCFullYear();
  const m = String(start.getUTCMonth() + 1).padStart(2, "0");
  const d = String(start.getUTCDate()).padStart(2, "0");
  return `${baseQuery} after:${y}/${m}/${d}`;
}
