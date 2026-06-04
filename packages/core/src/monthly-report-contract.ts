import type { MonthlyReportFacts } from "./domain/monthly-report-facts.js";
import { assertNoInventedMoneyStrings } from "./money-contract.js";

/** Every pre-formatted monetary string embedded in MonthlyReportFacts. */
export function collectMoneyStringsFromMonthlyReportFacts(
  facts: MonthlyReportFacts,
): Set<string> {
  const out = new Set<string>();
  out.add(facts.totalSpend);
  for (const c of facts.categories) {
    out.add(c.amount);
  }
  for (const match of facts.matchedReceipts) {
    if (match.receiptAmount) out.add(match.receiptAmount);
    out.add(match.chargeAmount);
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

export function assertNoInventedMonthlyReportNumbers(
  prose: string,
  facts: MonthlyReportFacts,
): void {
  const allowed = collectMoneyStringsFromMonthlyReportFacts(facts);
  assertNoInventedMoneyStrings(prose, allowed, "monthly report");
}
