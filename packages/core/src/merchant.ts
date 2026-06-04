/** Normalize a raw merchant name for cache keys. */
export function normalizeMerchant(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
