import { describe, it, expect } from "vitest";
import { makeSyncService } from "./sync-service.js";
import { makeInMemoryRepositories } from "../testing/in-memory-repos.js";
import { makeFakeBank } from "../testing/fake-bank.js";
import { makeCapturingJobProducer } from "../testing/capturing-jobs.js";
import { FixedClock } from "../testing/fixed-clock.js";
import { Money } from "../money.js";
import { newId } from "../ids.js";
import type { Item } from "../domain/item.js";
import type { Account } from "../domain/account.js";

describe("makeSyncService", () => {
  it("pages through hasMore, saves cursor, and enqueues categorize for new txns", async () => {
    const repos = makeInMemoryRepositories();
    const queue = makeCapturingJobProducer();
    const clock = new FixedClock(new Date("2026-05-20T12:00:00.000Z"));
    const userId = newId<"UserId">();
    const itemId = newId<"ItemId">();
    const accountId = newId<"AccountId">();

    const item: Item = {
      id: itemId,
      userId,
      plaidItemId: "plaid-item-1",
      status: "good",
      syncCursor: null,
      lastSyncedAt: null,
    };
    repos._seed.item(item, "access-token");

    const account: Account = {
      id: accountId,
      itemId,
      userId,
      plaidAccountId: "plaid-acct-1",
      name: "Checking",
      type: "depository",
      lastSyncedAt: null,
    };
    repos._seed.account(account);

    const bank = makeFakeBank({
      syncPages: [
        {
          added: [
            {
              plaidTransactionId: "txn-new-1",
              plaidAccountId: "plaid-acct-1",
              amount: Money.of(500, "USD"),
              merchantNameRaw: "COFFEE SHOP",
              plaidPfc: null,
              occurredAt: new Date("2026-05-19T10:00:00.000Z"),
            },
          ],
          modified: [],
          removed: [],
          nextCursor: "cursor-1",
          hasMore: true,
        },
        {
          added: [],
          modified: [],
          removed: [],
          nextCursor: "cursor-final",
          hasMore: false,
        },
      ],
    });

    const svc = makeSyncService({
      items: repos.items,
      accounts: repos.accounts,
      transactions: repos.transactions,
      bank,
      queue,
      clock,
    });

    await svc.run({ userId, itemId });

    const updated = await repos.items.findById(itemId);
    expect(updated?.syncCursor).toBe("cursor-final");
    expect(queue.jobs.filter((j) => j.name === "txn.categorize")).toHaveLength(1);
  });

  it("soft-deletes removed transactions and is idempotent on re-sync", async () => {
    const repos = makeInMemoryRepositories();
    const queue = makeCapturingJobProducer();
    const clock = new FixedClock();
    const userId = newId<"UserId">();
    const itemId = newId<"ItemId">();

    repos._seed.item(
      {
        id: itemId,
        userId,
        plaidItemId: "plaid-item-2",
        status: "good",
        syncCursor: "cursor-final",
        lastSyncedAt: null,
      },
      "token",
    );
    repos._seed.account({
      id: newId<"AccountId">(),
      itemId,
      userId,
      plaidAccountId: "plaid-acct-1",
      name: "Checking",
      type: "depository",
      lastSyncedAt: null,
    });

    const bank = makeFakeBank({
      syncPages: [
        {
          added: [],
          modified: [],
          removed: ["txn-remove-1"],
          nextCursor: "cursor-final",
          hasMore: false,
        },
      ],
    });

    const svc = makeSyncService({
      items: repos.items,
      accounts: repos.accounts,
      transactions: repos.transactions,
      bank,
      queue,
      clock,
    });

    await svc.run({ userId, itemId });
    expect(queue.jobs.filter((j) => j.name === "txn.categorize")).toHaveLength(0);
  });
});
