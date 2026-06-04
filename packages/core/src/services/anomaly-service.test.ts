import { describe, it, expect } from "vitest";
import { makeAnomalyService } from "./anomaly-service.js";
import { makeInMemoryRepositories } from "../testing/in-memory-repos.js";
import { makeCapturingJobProducer } from "../testing/capturing-jobs.js";
import { FixedClock } from "../testing/fixed-clock.js";
import { aTransaction } from "../testing/builders.js";
import { Money } from "../money.js";
import { newId } from "../ids.js";
import { TEST_ANOMALY_CONFIG } from "../testing/tunables.js";
import type { SpendBaseline } from "../domain/baseline.js";

describe("makeAnomalyService", () => {
  it("enqueues immediate delivery for high-severity anomalies", async () => {
    const repos = makeInMemoryRepositories();
    const queue = makeCapturingJobProducer();
    const clock = new FixedClock(new Date("2026-05-20T12:00:00.000Z"));
    const userId = newId<"UserId">();

    for (const minor of [999, 999, 999]) {
      repos._seed.transaction(
        aTransaction({
          userId,
          merchantName: "Netflix",
          merchantNameRaw: "NETFLIX",
          amount: Money.of(minor, "USD"),
          plaidTransactionId: `n-${minor}-${Math.random()}`,
          occurredAt: new Date("2026-05-01T10:00:00.000Z"),
          category: "subscriptions",
        }),
      );
    }

    const spike = aTransaction({
      userId,
      merchantName: "Netflix",
      merchantNameRaw: "NETFLIX",
      amount: Money.of(1599, "USD"),
      occurredAt: new Date("2026-05-20T11:00:00.000Z"),
      category: "subscriptions",
    });
    repos._seed.transaction(spike);

    const svc = makeAnomalyService({
      transactions: repos.transactions,
      baselines: repos.baselines,
      anomalies: repos.anomalies,
      queue,
      clock,
      detectionConfig: TEST_ANOMALY_CONFIG,
    });

    await svc.run({ userId, transactionId: spike.id });

    expect(queue.jobs.some((j) => j.name === "delivery.send")).toBe(true);
    const recent = await repos.anomalies.listRecent(userId, 5);
    expect(recent.length).toBeGreaterThan(0);
  });

  it("stores low-severity anomalies without immediate delivery", async () => {
    const repos = makeInMemoryRepositories();
    const queue = makeCapturingJobProducer();
    const clock = new FixedClock(new Date("2026-05-20T12:00:00.000Z"));
    const userId = newId<"UserId">();

    const baseline: SpendBaseline = {
      userId,
      category: "dining",
      period: "weekly",
      mean: Money.of(3000, "USD"),
      median: Money.of(3000, "USD"),
      stddevMinorUnits: 500,
      sampleCount: 10,
      computedAt: new Date(),
    };
    await repos.baselines.upsertMany(userId, [baseline]);

    const txn = aTransaction({
      userId,
      category: "dining",
      amount: Money.of(5000, "USD"),
      occurredAt: new Date("2026-05-20T11:00:00.000Z"),
    });
    repos._seed.transaction(txn);

    const svc = makeAnomalyService({
      transactions: repos.transactions,
      baselines: repos.baselines,
      anomalies: repos.anomalies,
      queue,
      clock,
      detectionConfig: TEST_ANOMALY_CONFIG,
    });

    await svc.run({ userId, transactionId: txn.id });

    expect(queue.jobs.filter((j) => j.name === "delivery.send")).toHaveLength(0);
    expect((await repos.anomalies.listRecent(userId, 5)).length).toBe(1);
  });
});
