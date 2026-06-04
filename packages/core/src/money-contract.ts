import { ValidationError } from "./errors.js";
import type { DigestFacts } from "./domain/digest-facts.js";

export const MONEY_IN_PROSE = /\$[\d,]+(?:\.\d{2})?/g;

/** Every pre-formatted monetary string embedded in DigestFacts. */
export function collectMoneyStringsFromFacts(facts: DigestFacts): Set<string> {
  const out = new Set<string>();
  out.add(facts.totalSpend);
  addTrend(out, facts.totalSpendVsBaseline);

  for (const c of facts.categories) {
    out.add(c.amount);
    addTrend(out, c.vsBaseline);
  }
  for (const a of facts.anomalies) {
    out.add(a.amount);
  }
  for (const match of facts.matchedReceipts) {
    if (match.receiptAmount) out.add(match.receiptAmount);
    out.add(match.chargeAmount);
    for (const li of match.lineItems) {
      if (li.amount) out.add(li.amount);
    }
  }
  for (const unmatched of facts.unmatchedReceipts) {
    if (unmatched.amount) out.add(unmatched.amount);
    for (const maybe of unmatched.maybeTransactions) {
      out.add(maybe.amount);
    }
  }
  for (const missing of facts.chargesMissingReceipts) {
    out.add(missing.amount);
  }
  return out;
}

function addTrend(
  out: Set<string>,
  trend: { baselineAmount: string } | null,
): void {
  if (trend) out.add(trend.baselineAmount);
}

/** Shared assertion core — checks every $figure in prose against an allow list. */
export function assertNoInventedMoneyStrings(
  prose: string,
  allowed: Set<string>,
  label: string,
): void {
  const found = prose.match(MONEY_IN_PROSE) ?? [];
  const invented = found.filter((token) => !allowed.has(token));
  if (invented.length > 0) {
    throw new ValidationError(
      `${label} prose contains figures not present in facts: ${invented.join(", ")}`,
      { invented, allowed: [...allowed] },
    );
  }
}

/**
 * Ensures every dollar figure in LLM prose appears in the deterministic facts.
 * This is the load-bearing money-contract guard (see docs/testing.md).
 */
export function assertNoInventedNumbers(
  prose: string,
  facts: DigestFacts,
): void {
  const allowed = collectMoneyStringsFromFacts(facts);
  assertNoInventedMoneyStrings(prose, allowed, "digest");
}
