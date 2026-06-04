import { describe, it, expect } from "vitest";
import { makeReportService } from "./report-service.js";
import { makeInMemoryRepositories } from "../testing/in-memory-repos.js";
import { makeCapturingJobProducer } from "../testing/capturing-jobs.js";
import { makeFakeLlm } from "../testing/fake-llm.js";
import { FixedClock } from "../testing/fixed-clock.js";
import { aUser, aTransaction } from "../testing/builders.js";
import { Money } from "../money.js";
import {
  TEST_DIGEST_FACTS_CONFIG,
  TEST_RECEIPT_MATCH_CONFIG,
} from "../testing/tunables.js";

describe("makeReportService", () => {
  it("builds monthly facts, stores the report, and enqueues delivery", async () => {
    const repos = makeInMemoryRepositories();
    const queue = makeCapturingJobProducer();
    const user = aUser({ timezone: "UTC" });
    repos._seed.user(user);
    repos._seed.transaction(
      aTransaction({
        userId: user.id,
        category: "shopping",
        amount: Money.of(5000, "USD"),
        occurredAt: new Date("2026-05-15T12:00:00.000Z"),
      }),
    );

    const svc = makeReportService({
      users: repos.users,
      transactions: repos.transactions,
      receipts: repos.receipts,
      mailMessages: repos.mailMessages,
      transactionReceiptLinks: repos.transactionReceiptLinks,
      reports: repos.reports,
      llm: makeFakeLlm(),
      queue,
      clock: new FixedClock(new Date("2026-06-01T09:00:00.000Z")),
      digestFactsConfig: TEST_DIGEST_FACTS_CONFIG,
      receiptEnrichmentConfig: {
        matchConfig: TEST_RECEIPT_MATCH_CONFIG,
        minParseConfidence: 0.75,
        categoriesTriggerMatch: ["shopping"],
      },
    });

    await svc.run({ userId: user.id, yearMonth: "2026-05" });

    const report = await repos.reports.findByYearMonth(user.id, "2026-05");
    expect(report).not.toBeNull();
    expect(report?.facts.totalSpend).toBe("$50.00");
    expect(report?.content).toContain("$50.00");
    expect(queue.jobs.some((j) => j.name === "delivery.send")).toBe(true);
  });
});
