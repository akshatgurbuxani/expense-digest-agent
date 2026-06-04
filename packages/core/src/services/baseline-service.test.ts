import { describe, it, expect } from "vitest";
import { makeBaselineService } from "./baseline-service.js";
import { makeInMemoryRepositories } from "../testing/in-memory-repos.js";
import { FixedClock } from "../testing/fixed-clock.js";
import { aTransaction } from "../testing/builders.js";
import { Money } from "../money.js";
import { newId } from "../ids.js";
import { TEST_DIGEST_FACTS_CONFIG } from "../testing/tunables.js";

describe("makeBaselineService", () => {
  it("recomputes per-category stats from enriched transactions", async () => {
    const repos = makeInMemoryRepositories();
    const clock = new FixedClock();
    const userId = newId<"UserId">();

    for (let i = 0; i < TEST_DIGEST_FACTS_CONFIG.minBaselineSamples; i++) {
      repos._seed.transaction(
        aTransaction({
          userId,
          category: "groceries",
          amount: Money.of(1000 + i * 100, "USD"),
          plaidTransactionId: `g-${i}`,
        }),
      );
    }

    const svc = makeBaselineService({
      transactions: repos.transactions,
      baselines: repos.baselines,
      clock,
    });

    await svc.run({ userId });

    const baseline = await repos.baselines.get(userId, "groceries", "weekly");
    expect(baseline?.sampleCount).toBe(TEST_DIGEST_FACTS_CONFIG.minBaselineSamples);
    expect(baseline?.mean.minorUnits).toBeGreaterThan(0);
  });
});
