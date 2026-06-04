import { describe, it, expect } from "vitest";
import { Money } from "./money.js";
import { aTransaction } from "./testing/builders.js";
import {
  scoreReceiptTransaction,
  selectBestTransactionMatch,
  type ReceiptForMatch,
} from "./receipt-match-scorer.js";
import { TEST_RECEIPT_MATCH_CONFIG } from "./testing/tunables.js";

const cfg = TEST_RECEIPT_MATCH_CONFIG;

function aReceipt(overrides: Partial<ReceiptForMatch> = {}): ReceiptForMatch {
  return {
    merchantName: "Amazon",
    totalAmount: Money.of(4599, "USD"),
    occurredAt: new Date("2026-05-20T18:00:00.000Z"),
    receivedAt: new Date("2026-05-20T18:05:00.000Z"),
    orderId: "123-4567890",
    kind: "order_confirmation",
    ...overrides,
  };
}

describe("receipt match scorer", () => {
  it("scores highly when amount, date, and merchant align", () => {
    const receipt = aReceipt();
    const txn = aTransaction({
      merchantName: "Amazon",
      amount: Money.of(4599, "USD"),
      category: "shopping",
      occurredAt: new Date("2026-05-20T12:00:00.000Z"),
    });

    const result = scoreReceiptTransaction(receipt, txn, cfg);
    expect(result.score).toBeGreaterThanOrEqual(cfg.minScore);
    expect(result.signals.map((s) => s.signal)).toContain("exactAmount");
    expect(result.signals.map((s) => s.signal)).toContain("merchantFuzzy");
  });

  it("returns zero when transaction is outside the date window", () => {
    const receipt = aReceipt();
    const txn = aTransaction({
      occurredAt: new Date("2026-05-01T12:00:00.000Z"),
    });

    const result = scoreReceiptTransaction(receipt, txn, cfg);
    expect(result.score).toBe(0);
    expect(result.signals[0]?.signal).toBe("date_out_of_range");
  });

  it("adds orderIdInMemo when order id appears in merchant text", () => {
    const receipt = aReceipt({ orderId: "ABC-999" });
    const txn = aTransaction({
      merchantNameRaw: "AMZN MKTP ABC-999",
      merchantName: "Amazon",
      amount: Money.of(4599, "USD"),
      occurredAt: new Date("2026-05-20T12:00:00.000Z"),
    });

    const result = scoreReceiptTransaction(receipt, txn, cfg);
    expect(result.signals.map((s) => s.signal)).toContain("orderIdInMemo");
  });

  describe("selectBestTransactionMatch", () => {
    it("returns best candidate above minScore", () => {
      const receipt = aReceipt();
      const good = aTransaction({
        merchantName: "Amazon",
        amount: Money.of(4599, "USD"),
        category: "shopping",
        occurredAt: new Date("2026-05-20T12:00:00.000Z"),
      });
      const weak = aTransaction({
        merchantName: "Coffee Shop",
        amount: Money.of(500, "USD"),
        occurredAt: new Date("2026-05-20T12:00:00.000Z"),
      });

      const { best, ranked } = selectBestTransactionMatch(
        receipt,
        [weak, good],
        cfg,
      );
      expect(best?.transaction.id).toBe(good.id);
      expect(ranked[0]?.transaction.id).toBe(good.id);
    });

    it("returns null when no candidate meets minScore", () => {
      const receipt = aReceipt();
      const txn = aTransaction({
        merchantName: "Unrelated Store",
        amount: Money.of(100, "USD"),
        occurredAt: new Date("2026-05-01T12:00:00.000Z"),
      });

      const { best } = selectBestTransactionMatch(receipt, [txn], cfg);
      expect(best).toBeNull();
    });
  });
});
