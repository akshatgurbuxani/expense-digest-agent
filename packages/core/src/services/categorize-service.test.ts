import { describe, it, expect } from "vitest";
import { makeCategorizeService } from "./categorize-service.js";
import { normalizeMerchant } from "../merchant.js";
import { makeInMemoryRepositories } from "../testing/in-memory-repos.js";
import { makeCapturingJobProducer } from "../testing/capturing-jobs.js";
import { makeFakeLlm, countingLlm } from "../testing/fake-llm.js";
import { FixedClock } from "../testing/fixed-clock.js";
import { aTransaction } from "../testing/builders.js";
import { Money } from "../money.js";
import { newId } from "../ids.js";

describe("makeCategorizeService", () => {
  it("calls LLM once on cache miss and writes to merchant cache", async () => {
    const repos = makeInMemoryRepositories();
    const llm = countingLlm(makeFakeLlm());
    const queue = makeCapturingJobProducer();
    const clock = new FixedClock();
    const userId = newId<"UserId">();
    const txn = aTransaction({ userId, merchantNameRaw: "UNKNOWN SHOP 123" });
    repos._seed.transaction(txn);

    const svc = makeCategorizeService({
      transactions: repos.transactions,
      merchants: repos.merchants,
      llm,
      queue,
      clock,
    });

    await svc.run({ userId, transactionId: txn.id });
    expect(llm.calls).toBe(1);
    const cached = await repos.merchants.lookup(
      normalizeMerchant("UNKNOWN SHOP 123"),
    );
    expect(cached).not.toBeNull();
  });

  it("uses cache on repeat merchant without calling LLM again", async () => {
    const repos = makeInMemoryRepositories();
    const llm = countingLlm(makeFakeLlm());
    const queue = makeCapturingJobProducer();
    const clock = new FixedClock();
    const userId = newId<"UserId">();

    const txn1 = aTransaction({
      userId,
      merchantNameRaw: "NETFLIX.COM",
      plaidTransactionId: "p1",
    });
    const txn2 = aTransaction({
      userId,
      id: newId<"TransactionId">(),
      merchantNameRaw: "NETFLIX.COM",
      plaidTransactionId: "p2",
    });
    repos._seed.transaction(txn1);
    repos._seed.transaction(txn2);

    const svc = makeCategorizeService({
      transactions: repos.transactions,
      merchants: repos.merchants,
      llm,
      queue,
      clock,
    });

    await svc.run({ userId, transactionId: txn1.id });
    await svc.run({ userId, transactionId: txn2.id });
    expect(llm.calls).toBe(1);
  });

  it("short-circuits on Plaid PFC before cache or LLM", async () => {
    const repos = makeInMemoryRepositories();
    const llm = countingLlm(makeFakeLlm());
    const queue = makeCapturingJobProducer();
    const clock = new FixedClock();
    const userId = newId<"UserId">();
    const txn = aTransaction({
      userId,
      merchantNameRaw: "WHOLEFDS",
      plaidPfc: "FOOD_AND_DRINK_GROCERIES",
    });
    repos._seed.transaction(txn);

    const svc = makeCategorizeService({
      transactions: repos.transactions,
      merchants: repos.merchants,
      llm,
      queue,
      clock,
    });

    await svc.run({ userId, transactionId: txn.id });
    expect(llm.calls).toBe(0);
    const saved = await repos.transactions.findById(userId, txn.id);
    expect(saved?.category).toBe("groceries");
  });

  it("enqueues anomaly.evaluate when subscription signal is detected", async () => {
    const repos = makeInMemoryRepositories();
    const llm = makeFakeLlm();
    const queue = makeCapturingJobProducer();
    const clock = new FixedClock();
    const userId = newId<"UserId">();
    const txn = aTransaction({
      userId,
      merchantNameRaw: "NETFLIX.COM",
      amount: Money.of(1599, "USD"),
    });
    repos._seed.transaction(txn);

    const svc = makeCategorizeService({
      transactions: repos.transactions,
      merchants: repos.merchants,
      llm,
      queue,
      clock,
    });

    await svc.run({ userId, transactionId: txn.id });
    expect(queue.jobs.some((j) => j.name === "anomaly.evaluate")).toBe(true);
    expect(queue.jobs.some((j) => j.name === "baseline.recompute")).toBe(true);
  });
});
