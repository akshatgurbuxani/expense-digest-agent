import { describe, it, expect } from "vitest";
import type { DigestFacts } from "@expense/core";
import { collectMoneyStringsFromFacts } from "@expense/core";
import { renderDigestHtml } from "./digest.html.js";

const sampleFacts = (): DigestFacts => ({
  user: { firstName: "Alex", currency: "USD" },
  window: { startLabel: "May 19", endLabel: "May 25" },
  totalSpend: "$1,204.55",
  totalSpendVsBaseline: {
    direction: "up",
    percent: "30%",
    baselineAmount: "$926.58",
  },
  categories: [
    {
      category: "groceries",
      amount: "$432.10",
      share: "36%",
      vsBaseline: null,
    },
  ],
  anomalies: [],
  matchedReceipts: [],
  unmatchedReceipts: [],
  chargesMissingReceipts: [],
  maturity: "established",
});

describe("renderDigestHtml", () => {
  it("includes prose and every monetary figure from facts without inventing new ones", () => {
    const facts = sampleFacts();
    const prose = "You spent $1,204.55 this week on groceries ($432.10).";
    const html = renderDigestHtml(prose, facts);

    expect(html).toContain("You spent $1,204.55 this week");
    for (const figure of collectMoneyStringsFromFacts(facts)) {
      expect(html).toContain(figure);
    }
    expect(html).not.toContain("$999.00");
  });

  it("escapes HTML in prose", () => {
    const html = renderDigestHtml("<script>alert(1)</script>", sampleFacts());
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
