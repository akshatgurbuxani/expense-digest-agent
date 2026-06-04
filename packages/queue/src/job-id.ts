/**
 * BullMQ rejects custom job ids containing `:` (Redis key segments).
 * Logical ids like `digest:{userId}:{isoWeek}` stay in domain code; the adapter
 * maps them at the enqueue boundary.
 */
export function toBullJobId(logicalJobId: string): string {
  return logicalJobId.replaceAll(":", "/");
}
