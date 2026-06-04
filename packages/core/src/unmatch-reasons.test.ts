import { describe, it, expect } from "vitest";
import { Money } from "./money.js";
import { aTransaction } from "./testing/builders.js";
import {
  selectBestTransactionMatch,
  type ReceiptForMatch,
} from "./receipt-match-scorer.js";
import {
  buildUnmatchedReceiptFact,
  deriveUnmatchReason,
  noReceiptFoundCopy,
  unmatchReasonDetail,
} from "./unmatch-reasons.js";
import { TEST_RECEIPT_MATCH_CONFIG } from "./testing/tunables.js";

const cfg = TEST_RECEIPT_MATCH_CONFIG;

function aReceipt(overrides: Partial<ReceiptForMatch> = {}): ReceiptForMatch {
  return {
    merchantName: "Amazon",
    totalAmount: Money.of(4599, "USD"),
    occurredAt: new Date("2026-05-20T18:00:00.000Z"),
    receivedAt: new Date("2026-05-20T18:05:00.000Z"),
    orderId: null,
    kind: "order_confirmation",
    ...overrides,
  };
}

describe("unmatch reasons", () => {
  it("derives low_parse_confidence when confidence is below threshold", () => {
    const selection = selectBestTransactionMatch(aReceipt(), [], cfg);
    const reason = deriveUnmatchReason(
      {
        receipt: aReceipt(),
        selection,
        parseConfidence: 0.5,
        minParseConfidence: 0.75,
      },
      cfg,
    );
    expect(reason).toBe("low_parse_confidence");
  });

  it("derives no_bank_activity when there are no candidates", () => {
    const selection = selectBestTransactionMatch(aReceipt(), [], cfg);
    const reason = deriveUnmatchReason(
      {
        receipt: aReceipt(),
        selection,
        parseConfidence: 0.9,
        minParseConfidence: 0.75,
      },
      cfg,
    );
    expect(reason).toBe("no_bank_activity");
  });

  it("derives amount_mismatch when merchant matches but amount does not", () => {
    const receipt = aReceipt();
    const txn = aTransaction({
      merchantName: "Amazon",
      amount: Money.of(999, "USD"),
      occurredAt: new Date("2026-05-20T12:00:00.000Z"),
    });
    const selection = selectBestTransactionMatch(receipt, [txn], cfg);
    const reason = deriveUnmatchReason(
      {
        receipt,
        selection,
        parseConfidence: 0.9,
        minParseConfidence: 0.75,
      },
      cfg,
    );
    expect(reason).toBe("amount_mismatch");
  });

  it("builds an unmatched fact with maybe-transaction candidates", () => {
    const receipt = aReceipt();
    const txn = aTransaction({
      merchantName: "Amazon",
      amount: Money.of(999, "USD"),
      occurredAt: new Date("2026-05-20T12:00:00.000Z"),
    });
    const selection = selectBestTransactionMatch(receipt, [txn], cfg);
    const fact = buildUnmatchedReceiptFact(
      {
        receipt,
        selection,
        parseConfidence: 0.9,
        minParseConfidence: 0.75,
      },
      cfg,
    );

    expect(fact.merchantName).toBe("Amazon");
    expect(fact.reason).toBe("amount_mismatch");
    expect(fact.reasonDetail).toContain("Amazon");
    expect(fact.maybeTransactions).toHaveLength(1);
    expect(fact.maybeTransactions[0]?.whyNot).toContain("amount differs");
  });

  it("provides human-readable reason detail", () => {
    expect(unmatchReasonDetail("no_bank_activity", aReceipt())).toContain(
      "No card charges",
    );
  });

  it("formats reverse missing-receipt copy", () => {
    expect(noReceiptFoundCopy("Target")).toBe(
      "No order email found for this charge at Target.",
    );
  });
});
