import { describe, it, expect } from "vitest";
import { Money } from "./money.js";
import { newId } from "./ids.js";
import { buildMonthlyReportFacts } from "./monthly-report-facts.js";
import { buildReceiptEnrichmentFacts } from "./receipt-enrichment-facts.js";
import { aTransaction } from "./testing/builders.js";
import {
  TEST_DIGEST_FACTS_CONFIG,
  TEST_RECEIPT_MATCH_CONFIG,
} from "./testing/tunables.js";
import type { ReceiptEnrichmentInput } from "./receipt-enrichment-facts.js";

const userId = newId<"UserId">();

describe("buildMonthlyReportFacts", () => {
  it("combines month spend totals with receipt enrichment sections", () => {
    const txn = aTransaction({
      userId,
      category: "shopping",
      amount: Money.of(5000, "USD"),
      occurredAt: new Date("2026-05-15T12:00:00.000Z"),
    });

    const receiptEnrichment: ReceiptEnrichmentInput = {
      unmatchedReceipts: [],
      mailMessageById: new Map(),
      transactionsInWindow: [txn],
      linksInWindow: [],
      receiptById: new Map(),
    };

    const facts = buildMonthlyReportFacts(
      {
        firstName: "Alex",
        currency: "USD",
        window: {
          monthLabel: "May 2026",
          yearMonth: "2026-05",
          start: new Date("2026-05-01T00:00:00.000Z"),
          end: new Date("2026-06-01T00:00:00.000Z"),
        },
        transactions: [txn],
        receiptEnrichment,
      },
      TEST_DIGEST_FACTS_CONFIG,
      {
        matchConfig: TEST_RECEIPT_MATCH_CONFIG,
        minParseConfidence: 0.75,
        categoriesTriggerMatch: ["shopping"],
      },
    );

    expect(facts.window.yearMonth).toBe("2026-05");
    expect(facts.totalSpend).toBe("$50.00");
    expect(facts.chargesMissingReceipts).toHaveLength(1);
    expect(buildReceiptEnrichmentFacts(receiptEnrichment, {
      matchConfig: TEST_RECEIPT_MATCH_CONFIG,
      minParseConfidence: 0.75,
      categoriesTriggerMatch: ["shopping"],
    }).chargesMissingReceipts).toHaveLength(1);
  });
});
