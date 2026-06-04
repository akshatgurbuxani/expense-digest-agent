import { describe, it, expect } from "vitest";
import { makeDigestService } from "./digest-service.js";
import { makeInMemoryRepositories } from "../testing/in-memory-repos.js";
import { makeCapturingJobProducer } from "../testing/capturing-jobs.js";
import { makeFakeLlm, makeAdversarialLlm } from "../testing/fake-llm.js";
import { FixedClock } from "../testing/fixed-clock.js";
import { aUser, aTransaction } from "../testing/builders.js";
import { Money } from "../money.js";
import { ValidationError } from "../errors.js";
import {
  TEST_DIGEST_FACTS_CONFIG,
  TEST_RECEIPT_MATCH_CONFIG,
} from "../testing/tunables.js";

const receiptEnrichmentDeps = {
  digestFactsConfig: TEST_DIGEST_FACTS_CONFIG,
  receiptEnrichmentConfig: {
    matchConfig: TEST_RECEIPT_MATCH_CONFIG,
    minParseConfidence: 0.75,
    categoriesTriggerMatch: ["shopping", "dining"] as const,
  },
};

function makeDigestSvc(
  repos: ReturnType<typeof makeInMemoryRepositories>,
  queue: ReturnType<typeof makeCapturingJobProducer>,
  clock: FixedClock,
  llm: ReturnType<typeof makeFakeLlm>,
) {
  return makeDigestService({
    users: repos.users,
    transactions: repos.transactions,
    baselines: repos.baselines,
    anomalies: repos.anomalies,
    digests: repos.digests,
    receipts: repos.receipts,
    mailMessages: repos.mailMessages,
    transactionReceiptLinks: repos.transactionReceiptLinks,
    llm,
    queue,
    clock,
    ...receiptEnrichmentDeps,
  });
}

describe("makeDigestService", () => {
  it("computes facts, writes digest, validates money contract, stores and enqueues delivery", async () => {
    const repos = makeInMemoryRepositories();
    const queue = makeCapturingJobProducer();
    const clock = new FixedClock(new Date("2026-05-25T15:00:00.000Z"));
    const user = aUser({ timezone: "UTC" });
    repos._seed.user(user);
    repos._seed.transaction(
      aTransaction({
        userId: user.id,
        category: "dining",
        amount: Money.of(2500, "USD"),
        occurredAt: new Date("2026-05-24T12:00:00.000Z"),
      }),
    );

    const svc = makeDigestSvc(repos, queue, clock, makeFakeLlm());

    await svc.run({ userId: user.id, isoWeek: "2026-W21" });

    const history = await repos.digests.history(user.id, 1);
    expect(history).toHaveLength(1);
    expect(history[0]?.content).toContain("$25.00");
    expect(queue.jobs.some((j) => j.name === "delivery.send")).toBe(true);
  });

  it("rejects a digest when the LLM invents a figure", async () => {
    const repos = makeInMemoryRepositories();
    const queue = makeCapturingJobProducer();
    const clock = new FixedClock(new Date("2026-05-25T15:00:00.000Z"));
    const user = aUser({ timezone: "UTC" });
    repos._seed.user(user);
    repos._seed.transaction(
      aTransaction({
        userId: user.id,
        category: "dining",
        amount: Money.of(1000, "USD"),
        occurredAt: new Date("2026-05-24T12:00:00.000Z"),
      }),
    );

    const svc = makeDigestSvc(repos, queue, clock, makeAdversarialLlm());

    await expect(
      svc.run({ userId: user.id, isoWeek: "2026-W21" }),
    ).rejects.toThrow(ValidationError);
    expect(await repos.digests.history(user.id, 5)).toHaveLength(0);
  });
});
