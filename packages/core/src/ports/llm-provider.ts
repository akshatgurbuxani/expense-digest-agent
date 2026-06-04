import type { Category } from "../domain/category.js";
import type { DigestFacts } from "../domain/digest-facts.js";
import type { MonthlyReportFacts } from "../domain/monthly-report-facts.js";
import type { MerchantSignals } from "../domain/merchant-signals.js";

export interface MerchantEnrichment {
  readonly merchantName: string;
  readonly category: Category;
  readonly signals: MerchantSignals;
}

export interface LlmProvider {
  categorizeMerchant(input: {
    rawName: string;
    plaidPfc: string | null;
    amountHint: string;
  }): Promise<MerchantEnrichment>;

  writeDigest(facts: DigestFacts): Promise<{ subject: string; body: string }>;

  writeMonthlyReport(
    facts: MonthlyReportFacts,
  ): Promise<{ subject: string; body: string }>;
}
