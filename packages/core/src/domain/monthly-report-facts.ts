import type { CurrencyCode } from "../money.js";
import type { Category } from "./category.js";
import type { ChargeMissingReceiptFact } from "./charge-missing-receipt.js";
import type { MatchedReceiptFact } from "./matched-receipt.js";
import type { UnmatchedReceiptFact } from "./unmatched-receipt.js";

/** Deterministic monthly report payload — prose-only LLM in G9. */
export interface MonthlyReportFacts {
  readonly user: {
    readonly firstName: string | null;
    readonly currency: CurrencyCode;
  };
  readonly window: {
    readonly monthLabel: string;
    readonly yearMonth: string;
  };
  readonly totalSpend: string;
  readonly categories: ReadonlyArray<{
    readonly category: Category;
    readonly amount: string;
    readonly share: string;
  }>;
  readonly matchedReceipts: readonly MatchedReceiptFact[];
  readonly unmatchedReceipts: readonly UnmatchedReceiptFact[];
  readonly chargesMissingReceipts: readonly ChargeMissingReceiptFact[];
}
