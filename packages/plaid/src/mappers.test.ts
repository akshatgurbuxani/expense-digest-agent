import { describe, it, expect } from "vitest";
import { Money } from "@expense/core";
import type { Transaction } from "plaid";
import { mapPlaidTransaction, mapSyncResponse } from "./mappers.js";

function sampleTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    account_id: "acct_123",
    transaction_id: "txn_abc",
    amount: 12.34,
    iso_currency_code: "USD",
    unofficial_currency_code: null,
    date: "2026-05-20",
    name: "STARBUCKS STORE 123",
    merchant_name: "Starbucks",
    personal_finance_category: {
      primary: "FOOD_AND_DRINK",
      detailed: "FOOD_AND_DRINK_COFFEE",
      confidence_level: "VERY_HIGH",
    },
    location: {},
    payment_meta: {},
    pending: false,
    pending_transaction_id: null,
    account_owner: null,
    ...overrides,
  } as Transaction;
}

describe("mapPlaidTransaction", () => {
  it("maps ids, merchant, PFC, amount, and date", () => {
    const raw = mapPlaidTransaction(sampleTxn());

    expect(raw.plaidTransactionId).toBe("txn_abc");
    expect(raw.plaidAccountId).toBe("acct_123");
    expect(raw.merchantNameRaw).toBe("Starbucks");
    expect(raw.plaidPfc).toBe("FOOD_AND_DRINK");
    expect(raw.amount).toEqual(Money.fromDecimalString("12.34", "USD"));
    expect(raw.occurredAt).toEqual(new Date("2026-05-20T00:00:00.000Z"));
  });

  it("falls back to name when merchant_name is null", () => {
    const raw = mapPlaidTransaction(
      sampleTxn({ merchant_name: null, name: "ACH DEBIT" }),
    );
    expect(raw.merchantNameRaw).toBe("ACH DEBIT");
  });

  it("preserves negative amounts for credits/refunds", () => {
    const raw = mapPlaidTransaction(sampleTxn({ amount: -50 }));
    expect(raw.amount).toEqual(Money.fromDecimalString("-50", "USD"));
  });
});

describe("mapSyncResponse", () => {
  it("maps added, modified, removed, cursor, and hasMore", () => {
    const page = mapSyncResponse({
      added: [sampleTxn()],
      modified: [],
      removed: [{ transaction_id: "txn_removed", account_id: "acct_123" }],
      next_cursor: "cursor-2",
      has_more: true,
    });

    expect(page.added).toHaveLength(1);
    expect(page.modified).toHaveLength(0);
    expect(page.removed).toEqual(["txn_removed"]);
    expect(page.nextCursor).toBe("cursor-2");
    expect(page.hasMore).toBe(true);
  });
});
