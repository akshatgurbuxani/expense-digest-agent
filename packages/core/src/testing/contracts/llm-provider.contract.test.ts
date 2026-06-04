import { describe, it, expect } from "vitest";
import { llmProviderContract } from "./llm-provider.contract.js";
import { makeFakeLlm } from "../fake-llm.js";

llmProviderContract(makeFakeLlm, "FakeLlm");

describe("FakeLlm specifics", () => {
  it("maps known merchant prefixes deterministically", async () => {
    const llm = makeFakeLlm();
    const r = await llm.categorizeMerchant({
      rawName: "NETFLIX.COM",
      plaidPfc: null,
      amountHint: "$15.99",
    });
    expect(r.merchantName).toBe("Netflix");
    expect(r.category).toBe("subscriptions");
  });
});
