import { Money, type CurrencyCode } from "@expense/core";
import type { Transaction } from "@expense/core";

export function defaultCurrency(txns: readonly Transaction[]): CurrencyCode {
  return txns.find((t) => t.category !== null)?.amount.currency ?? "USD";
}

export function sumTransactions(
  txns: readonly Transaction[],
  currency: CurrencyCode,
): Money {
  let total = Money.of(0, currency);
  for (const t of txns) {
    if (t.removedAt !== null || t.category === null) continue;
    total = total.add(t.amount);
  }
  return total;
}

export function totalsByCategory(
  txns: readonly Transaction[],
  currency: CurrencyCode,
): Record<string, string> {
  const map = new Map<string, Money>();
  for (const t of txns) {
    if (t.removedAt !== null || t.category === null) continue;
    const prev = map.get(t.category) ?? Money.of(0, currency);
    map.set(t.category, prev.add(t.amount));
  }
  return Object.fromEntries(
    [...map.entries()].map(([category, amount]) => [
      category,
      amount.toDisplayString(),
    ]),
  );
}
