import { buildDigestFacts, type DigestFactsConfig } from "./digest-facts.js";
import type { MonthlyReportFacts } from "./domain/monthly-report-facts.js";
import type { CurrencyCode } from "./money.js";
import type { Transaction } from "./domain/transaction.js";
import type { SpendBaseline } from "./domain/baseline.js";
import {
  buildReceiptEnrichmentFacts,
  type ReceiptEnrichmentConfig,
  type ReceiptEnrichmentInput,
} from "./receipt-enrichment-facts.js";

export interface BuildMonthlyReportFactsInput {
  readonly firstName: string | null;
  readonly currency: CurrencyCode;
  readonly window: {
    readonly monthLabel: string;
    readonly yearMonth: string;
    readonly start: Date;
    readonly end: Date;
  };
  readonly transactions: readonly Transaction[];
  readonly receiptEnrichment: ReceiptEnrichmentInput;
}

/** Pure: calendar-month spend + receipt enrichment for monthly reports. */
export function buildMonthlyReportFacts(
  input: BuildMonthlyReportFactsInput,
  digestConfig: DigestFactsConfig,
  receiptConfig: ReceiptEnrichmentConfig,
): MonthlyReportFacts {
  const spend = buildDigestFacts(
    {
      firstName: input.firstName,
      currency: input.currency,
      window: {
        startLabel: input.window.monthLabel,
        endLabel: input.window.monthLabel,
      },
      transactions: input.transactions,
      baselines: [] as readonly SpendBaseline[],
      anomalies: [],
    },
    digestConfig,
  );

  const receiptFacts = buildReceiptEnrichmentFacts(
    input.receiptEnrichment,
    receiptConfig,
  );

  return {
    user: spend.user,
    window: {
      monthLabel: input.window.monthLabel,
      yearMonth: input.window.yearMonth,
    },
    totalSpend: spend.totalSpend,
    categories: spend.categories.map(({ category, amount, share }) => ({
      category,
      amount,
      share,
    })),
    matchedReceipts: receiptFacts.matchedReceipts,
    unmatchedReceipts: receiptFacts.unmatchedReceipts,
    chargesMissingReceipts: receiptFacts.chargesMissingReceipts,
  };
}
