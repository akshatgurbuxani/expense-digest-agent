import { describe, it, expect } from "vitest";
import { makeFakeBank } from "../fake-bank.js";
import { bankProviderContract } from "./bank-provider.contract.js";
import { Money } from "../../money.js";

bankProviderContract(() => makeFakeBank(), "FakeBank");

describe("FakeBank specifics", () => {
  it("pages through scripted sync responses", async () => {
    const bank = makeFakeBank({
      syncPages: [
        {
          added: [
            {
              plaidTransactionId: "txn-1",
              plaidAccountId: "acct-1",
              amount: Money.of(100, "USD"),
              merchantNameRaw: "TEST",
              plaidPfc: null,
              occurredAt: new Date("2026-05-01T00:00:00.000Z"),
            },
          ],
          modified: [],
          removed: [],
          nextCursor: "c1",
          hasMore: true,
        },
        {
          added: [],
          modified: [],
          removed: ["txn-old"],
          nextCursor: "c2",
          hasMore: false,
        },
      ],
    });

    const first = await bank.syncTransactions({
      accessToken: "token",
      cursor: null,
    });
    expect(first.added).toHaveLength(1);
    expect(first.hasMore).toBe(true);

    const second = await bank.syncTransactions({
      accessToken: "token",
      cursor: "c1",
    });
    expect(second.removed).toEqual(["txn-old"]);
    expect(second.hasMore).toBe(false);
  });

  it("verifyWebhook returns configured routing facts", async () => {
    const bank = makeFakeBank({
      webhook: {
        itemId: "item_test",
        type: "TRANSACTIONS",
        code: "SYNC_UPDATES_AVAILABLE",
      },
    });

    const verified = await bank.verifyWebhook({}, Buffer.from("{}"));
    expect(verified.itemId).toBe("item_test");
  });
});
