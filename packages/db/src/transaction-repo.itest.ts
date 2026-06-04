import { beforeEach, describe, it, expect } from "vitest";
import { aTransaction } from "@expense/core/testing";
import { transactionRepositoryContract } from "@expense/core/testing/contracts";
import { Money, newId } from "@expense/core";
import { makePrisma } from "./client.js";
import { makeTransactionRepository } from "./transaction-repo.js";
import {
  TEST_DATABASE_URL,
  clearDatabase,
  seedTenantGraph,
} from "./testing/fixtures.js";

const prisma = makePrisma(TEST_DATABASE_URL);

beforeEach(async () => {
  await clearDatabase(prisma);
});

transactionRepositoryContract(
  () => makeTransactionRepository(prisma),
  "Prisma",
  {
    prepare: async ({ userId, accountId }) => {
      await seedTenantGraph(prisma, { userId, accountId });
    },
  },
);

describe("TransactionRepository tenant isolation (Prisma)", () => {
  it("never returns user B rows when querying as user A", async () => {
    const repo = makeTransactionRepository(prisma);
    const userA = newId<"UserId">();
    const userB = newId<"UserId">();
    const accountA = newId<"AccountId">();
    const accountB = newId<"AccountId">();

    await seedTenantGraph(prisma, { userId: userA, accountId: accountA });
    await seedTenantGraph(prisma, { userId: userB, accountId: accountB });

    const txnB = aTransaction({
      userId: userB,
      accountId: accountB,
      plaidTransactionId: "plaid-b-only",
      amount: Money.of(500, "USD"),
    });
    await repo.upsertMany(userB, [txnB]);

    const rows = await repo.listForUser(userA);
    expect(rows).toHaveLength(0);
  });
});
