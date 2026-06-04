import { describe, it, expect } from "vitest";
import type { MonthlyReportFacts } from "@expense/core";
import { collectMoneyStringsFromMonthlyReportFacts } from "@expense/core";
import { renderMonthlyReportHtml } from "./monthly-report.html.js";

const sampleFacts = (): MonthlyReportFacts => ({
  user: { firstName: "Alex", currency: "USD" },
  window: { monthLabel: "May 2026", yearMonth: "2026-05" },
  totalSpend: "$120.00",
  categories: [{ category: "shopping", amount: "$120.00", share: "100%" }],
  matchedReceipts: [],
  unmatchedReceipts: [],
  chargesMissingReceipts: [
    {
      merchantName: "Target",
      amount: "$120.00",
      occurredAt: "2026-05-15T12:00:00.000Z",
      category: "shopping",
      detail: "No order email found for this charge at Target.",
    },
  ],
});

describe("renderMonthlyReportHtml", () => {
  it("includes prose and every monetary figure from facts", () => {
    const facts = sampleFacts();
    const prose = "You spent $120.00 in May 2026.";
    const html = renderMonthlyReportHtml(prose, facts);

    expect(html).toContain("You spent $120.00 in May 2026.");
    for (const figure of collectMoneyStringsFromMonthlyReportFacts(facts)) {
      expect(html).toContain(figure);
    }
  });
});
