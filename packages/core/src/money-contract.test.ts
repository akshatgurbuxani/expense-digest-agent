import { describe, it, expect } from "vitest";
import {
  assertNoInventedNumbers,
  collectMoneyStringsFromFacts,
} from "./money-contract.js";
import { ValidationError } from "./errors.js";
import type { DigestFacts } from "./domain/digest-facts.js";

const sampleFacts = (over: Partial<DigestFacts> = {}): DigestFacts => ({
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
      vsBaseline: {
        direction: "up",
        percent: "12%",
        baselineAmount: "$386.00",
      },
    },
  ],
  anomalies: [],
  matchedReceipts: [],
  unmatchedReceipts: [],
  chargesMissingReceipts: [],
  maturity: "established",
  ...over,
});

describe("money-contract", () => {
  it("collects every monetary string from facts", () => {
    const strings = collectMoneyStringsFromFacts(sampleFacts());
    expect(strings).toContain("$1,204.55");
    expect(strings).toContain("$432.10");
    expect(strings).toContain("$926.58");
    expect(strings).toContain("$386.00");
  });

  it("passes when prose only uses figures from facts", () => {
    const prose =
      "You spent $1,204.55 this week. Groceries were $432.10 (36% of spend).";
    expect(() => assertNoInventedNumbers(prose, sampleFacts())).not.toThrow();
  });

  it("rejects prose that contains a figure not in the facts", () => {
    const prose =
      "You spent $1,204.55 this week, including $999.00 on snacks.";
    expect(() => assertNoInventedNumbers(prose, sampleFacts())).toThrow(
      ValidationError,
    );
  });

  it("ignores non-currency numbers like percentages in prose", () => {
    const prose = "Groceries were 36% of your spend at $432.10.";
    expect(() => assertNoInventedNumbers(prose, sampleFacts())).not.toThrow();
  });
});
