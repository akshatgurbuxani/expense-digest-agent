import type { CurrencyCode } from "../money.js";
import type { Category } from "./category.js";
import type { AnomalyReason } from "./anomaly.js";
import type { ChargeMissingReceiptFact } from "./charge-missing-receipt.js";
import type { MatchedReceiptFact } from "./matched-receipt.js";
import type { UnmatchedReceiptFact } from "./unmatched-receipt.js";

export interface TrendFact {
  readonly direction: "up" | "down" | "flat";
  readonly percent: string;
  readonly baselineAmount: string;
}

export interface DigestFacts {
  readonly user: {
    readonly firstName: string | null;
    readonly currency: CurrencyCode;
  };
  readonly window: { readonly startLabel: string; readonly endLabel: string };
  readonly totalSpend: string;
  readonly totalSpendVsBaseline: TrendFact | null;
  readonly categories: ReadonlyArray<{
    readonly category: Category;
    readonly amount: string;
    readonly share: string;
    readonly vsBaseline: TrendFact | null;
  }>;
  readonly anomalies: ReadonlyArray<{
    readonly reason: AnomalyReason;
    readonly detail: string;
    readonly amount: string;
  }>;
  readonly matchedReceipts: readonly MatchedReceiptFact[];
  readonly unmatchedReceipts: readonly UnmatchedReceiptFact[];
  readonly chargesMissingReceipts: readonly ChargeMissingReceiptFact[];
  readonly maturity: "learning" | "established";
}
