import { describe, it, expect } from "vitest";
import type { AccountId, UserId } from "../../ids.js";
import type { TransactionRepository } from "../../ports/repositories.js";
import { Money } from "../../money.js";
import { newId } from "../../ids.js";
import { aTransaction } from "../builders.js";

export interface TransactionContractOptions {
  /** Seed FK rows (user, account) before each test — required for Prisma adapters. */
  prepare?: (ctx: {
    userId: UserId;
    accountId: AccountId;
  }) => void | Promise<void>;
}

export function transactionRepositoryContract(
  makeRepo: () => TransactionRepository,
  label: string,
  options: TransactionContractOptions = {},
) {
  describe(`TransactionRepository contract (${label})`, () => {
    it("upserts idempotently on plaid_transaction_id", async () => {
      const repo = makeRepo();
      const userId = newId<"UserId">();
      const accountId = newId<"AccountId">();
      await options.prepare?.({ userId, accountId });
      const txn = aTransaction({ userId, accountId, plaidTransactionId: "plaid-txn-1" });

      const first = await repo.upsertMany(userId, [txn]);
      expect(first.insertedIds).toEqual([txn.id]);

      const dup = aTransaction({
        userId,
        id: newId<"TransactionId">(),
        plaidTransactionId: "plaid-txn-1",
        amount: Money.of(2000, "USD"),
      });
      const second = await repo.upsertMany(userId, [dup]);
      expect(second.insertedIds).toEqual([]);
    });

    it("scopes reads to the requesting user", async () => {
      const repo = makeRepo();
      const userA = newId<"UserId">();
      const userB = newId<"UserId">();
      const accountId = newId<"AccountId">();
      await options.prepare?.({ userId: userA, accountId });
      const txn = aTransaction({ userId: userA, accountId });
      await repo.upsertMany(userA, [txn]);

      expect(await repo.findById(userA, txn.id)).not.toBeNull();
      expect(await repo.findById(userB, txn.id)).toBeNull();
    });

    it("soft-deletes by plaid id for the correct tenant only", async () => {
      const repo = makeRepo();
      const userId = newId<"UserId">();
      const accountId = newId<"AccountId">();
      await options.prepare?.({ userId, accountId });
      const txn = aTransaction({ userId, accountId, plaidTransactionId: "plaid-rm-1" });
      await repo.upsertMany(userId, [txn]);
      await repo.softDeleteByPlaidIds(userId, ["plaid-rm-1"]);

      const found = await repo.findById(userId, txn.id);
      expect(found?.removedAt).not.toBeNull();
    });
  });
}
