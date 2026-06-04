import { describe, it, expect } from "vitest";
import { assertNoInventedNumbers } from "@expense/core";
import type { DigestFacts } from "@expense/core";
import { llmProviderContract } from "@expense/core/testing/contracts";
import { makeClaudeLlm } from "./claude-llm-provider.js";
import { claudeIntegrationEnabled, claudeTestConfig } from "./testing/helpers.js";

const sampleFacts = (): DigestFacts => ({
  user: { firstName: "Alex", currency: "USD" },
  window: { startLabel: "May 19", endLabel: "May 25" },
  totalSpend: "$45.00",
  totalSpendVsBaseline: null,
  categories: [
    {
      category: "dining",
      amount: "$45.00",
      share: "100%",
      vsBaseline: null,
    },
  ],
  anomalies: [],
  matchedReceipts: [],
  unmatchedReceipts: [],
  chargesMissingReceipts: [],
  maturity: "learning",
});

describe.skipIf(!claudeIntegrationEnabled())("ClaudeLlmProvider (live API)", () => {
  const llm = makeClaudeLlm(claudeTestConfig());

  llmProviderContract(() => llm, "Claude");

  it("passes the money-contract validator on a real digest", async () => {
    const facts = sampleFacts();
    const { body } = await llm.writeDigest(facts);
    expect(() => assertNoInventedNumbers(body, facts)).not.toThrow();
  });
});
