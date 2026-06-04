import { describe, it, expect } from "vitest";
import type { LlmProvider } from "../../ports/llm-provider.js";
import { CATEGORIES } from "../../domain/category.js";
import type { DigestFacts } from "../../domain/digest-facts.js";

const sampleFacts = (): DigestFacts => ({
  user: { firstName: "Alex", currency: "USD" },
  window: { startLabel: "May 19", endLabel: "May 25" },
  totalSpend: "$100.00",
  totalSpendVsBaseline: null,
  categories: [
    { category: "groceries", amount: "$100.00", share: "100%", vsBaseline: null },
  ],
  anomalies: [],
  matchedReceipts: [],
  unmatchedReceipts: [],
  chargesMissingReceipts: [],
  maturity: "learning",
});

/** Shared contract every LlmProvider implementation must satisfy. */
export function llmProviderContract(makeLlm: () => LlmProvider, label: string) {
  describe(`LlmProvider contract (${label})`, () => {
    it("returns a category within the CATEGORIES enum", async () => {
      const llm = makeLlm();
      const result = await llm.categorizeMerchant({
        rawName: "WHOLEFDS MKT",
        plaidPfc: null,
        amountHint: "$10.00",
      });
      expect(CATEGORIES).toContain(result.category);
      expect(result.merchantName.length).toBeGreaterThan(0);
      expect(result.signals.confidence).toBeGreaterThan(0);
    });

    it("writeDigest uses only figures present in DigestFacts", async () => {
      const llm = makeLlm();
      const facts = sampleFacts();
      const { subject, body } = await llm.writeDigest(facts);
      expect(subject.length).toBeGreaterThan(0);
      expect(body).toContain(facts.totalSpend);
      expect(body).not.toMatch(/\$999\.00/);
    });
  });
}
