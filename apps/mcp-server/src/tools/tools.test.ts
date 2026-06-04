import { describe, it, expect } from "vitest";
import {
  Money,
  newId,
  type Anomaly,
  type Digest,
  type DigestFacts,
} from "@expense/core";
import {
  aTransaction,
  aUser,
  FixedClock,
  makeInMemoryRepositories,
} from "@expense/core/testing";
import {
  compareToLastMonth,
  getDigestHistory,
  getSpendingByCategory,
  getSpendingThisWeek,
  listRecentAnomalies,
  type McpToolDeps,
} from "./index.js";

const sampleFacts = (): DigestFacts => ({
  user: { firstName: "Alex", currency: "USD" },
  window: { startLabel: "May 19", endLabel: "May 25" },
  totalSpend: "$45.00",
  totalSpendVsBaseline: null,
  categories: [],
  anomalies: [],
  matchedReceipts: [],
  unmatchedReceipts: [],
  chargesMissingReceipts: [],
  maturity: "learning",
});

function depsFor(
  userId: ReturnType<typeof aUser>["id"],
  repos: ReturnType<typeof makeInMemoryRepositories>,
  clock: FixedClock,
): McpToolDeps {
  return {
    userId,
    repos,
    clock,
  };
}

describe("MCP tools (tenant-scoped)", () => {
  const clock = new FixedClock(new Date("2026-05-25T15:00:00.000Z"));
  const userA = aUser({ timezone: "UTC" });
  const userB = aUser({ timezone: "UTC" });

  it("getSpendingThisWeek returns only the authenticated user's spending", async () => {
    const repos = makeInMemoryRepositories();
    repos._seed.user(userA);
    repos._seed.user(userB);
    repos._seed.transaction(
      aTransaction({
        userId: userA.id,
        amount: Money.of(5000, "USD"),
        occurredAt: new Date("2026-05-24T12:00:00.000Z"),
        plaidTransactionId: "a-1",
      }),
    );
    repos._seed.transaction(
      aTransaction({
        userId: userB.id,
        amount: Money.of(99900, "USD"),
        occurredAt: new Date("2026-05-24T12:00:00.000Z"),
        plaidTransactionId: "b-1",
      }),
    );

    const resultA = await getSpendingThisWeek(depsFor(userA.id, repos, clock));
    const resultB = await getSpendingThisWeek(depsFor(userB.id, repos, clock));

    expect(resultA.total).toBe("$50.00");
    expect(resultB.total).toBe("$999.00");
  });

  it("getSpendingByCategory scopes to the authenticated user", async () => {
    const repos = makeInMemoryRepositories();
    repos._seed.user(userA);
    repos._seed.user(userB);
    repos._seed.transaction(
      aTransaction({
        userId: userA.id,
        category: "groceries",
        amount: Money.of(3200, "USD"),
        occurredAt: new Date("2026-05-24T12:00:00.000Z"),
        plaidTransactionId: "a-g",
      }),
    );
    repos._seed.transaction(
      aTransaction({
        userId: userB.id,
        category: "groceries",
        amount: Money.of(8800, "USD"),
        occurredAt: new Date("2026-05-24T12:00:00.000Z"),
        plaidTransactionId: "b-g",
      }),
    );

    const result = await getSpendingByCategory(
      depsFor(userA.id, repos, clock),
      "groceries",
    );

    expect(result.total).toBe("$32.00");
    expect(result.transactionCount).toBe(1);
  });

  it("listRecentAnomalies cannot read another tenant's anomalies", async () => {
    const repos = makeInMemoryRepositories();
    repos._seed.user(userA);
    repos._seed.user(userB);

    const anomalyB: Anomaly = {
      id: newId<"AnomalyId">(),
      userId: userB.id,
      transactionId: newId<"TransactionId">(),
      reason: "price_increase",
      severity: "high",
      detail: "User B secret anomaly",
      detectedAt: new Date("2026-05-20T12:00:00.000Z"),
      deliveredAt: null,
    };
    await repos.anomalies.create(anomalyB);

    const rows = await listRecentAnomalies(depsFor(userA.id, repos, clock));
    expect(rows).toHaveLength(0);
  });

  it("getDigestHistory cannot read another tenant's digests", async () => {
    const repos = makeInMemoryRepositories();
    repos._seed.user(userA);
    repos._seed.user(userB);

    const digestB: Digest = {
      id: newId<"DigestId">(),
      userId: userB.id,
      weekStart: new Date("2026-05-18T00:00:00.000Z"),
      weekEnd: new Date("2026-05-25T00:00:00.000Z"),
      facts: sampleFacts(),
      subject: "User B digest",
      content: "secret",
      deliveredAt: null,
    };
    await repos.digests.create(digestB);

    const rows = await getDigestHistory(depsFor(userA.id, repos, clock), 5);
    expect(rows).toHaveLength(0);
  });

  it("compareToLastMonth uses only the authenticated user's transactions", async () => {
    const repos = makeInMemoryRepositories();
    repos._seed.user(userA);
    repos._seed.user(userB);
    repos._seed.transaction(
      aTransaction({
        userId: userA.id,
        amount: Money.of(1000, "USD"),
        occurredAt: new Date("2026-05-10T12:00:00.000Z"),
        plaidTransactionId: "a-m",
      }),
    );
    repos._seed.transaction(
      aTransaction({
        userId: userB.id,
        amount: Money.of(500000, "USD"),
        occurredAt: new Date("2026-05-10T12:00:00.000Z"),
        plaidTransactionId: "b-m",
      }),
    );

    const result = await compareToLastMonth(depsFor(userA.id, repos, clock));
    expect(result.thisMonth.total).toBe("$10.00");
  });
});
