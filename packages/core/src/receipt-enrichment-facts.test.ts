import { describe, it, expect } from "vitest";
import { Money } from "./money.js";
import { newId } from "./ids.js";
import { aTransaction } from "./testing/builders.js";
import { TEST_RECEIPT_MATCH_CONFIG } from "./testing/tunables.js";
import {
  buildReceiptEnrichmentFacts,
  type ReceiptEnrichmentConfig,
  type ReceiptEnrichmentInput,
} from "./receipt-enrichment-facts.js";
import type { MailMessage } from "./domain/mail-message.js";
import type { Receipt } from "./domain/receipt.js";
import type { TransactionReceiptLink } from "./domain/transaction-receipt-link.js";

const userId = newId<"UserId">();
const mailAccountId = newId<"MailAccountId">();

const receiptConfig: ReceiptEnrichmentConfig = {
  matchConfig: TEST_RECEIPT_MATCH_CONFIG,
  minParseConfidence: 0.75,
  categoriesTriggerMatch: ["shopping", "dining"],
};

function aMailMessage(
  overrides: Partial<MailMessage> = {},
): MailMessage {
  return {
    id: newId<"MailMessageId">(),
    userId,
    mailAccountId,
    gmailMessageId: "gmail-1",
    threadId: "thread-1",
    receivedAt: new Date("2026-05-20T18:05:00.000Z"),
    fromAddress: "Amazon <order-update@amazon.com>",
    fromDomain: "amazon.com",
    subject: "Your order",
    processingStatus: "parsed",
    ignoreReason: null,
    receiptKind: "order_confirmation",
    ...overrides,
  };
}

function aReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: newId<"ReceiptId">(),
    userId,
    mailMessageId: newId<"MailMessageId">(),
    kind: "order_confirmation",
    merchantName: "Amazon",
    merchantDomain: "amazon.com",
    orderId: "123-456",
    orderUrl: null,
    totalAmount: Money.of(4599, "USD"),
    occurredAt: new Date("2026-05-20T18:00:00.000Z"),
    lineItems: [],
    extractedAt: new Date("2026-05-20T18:10:00.000Z"),
    extractionSource: "llm",
    confidence: 0.9,
    ...overrides,
  };
}

describe("buildReceiptEnrichmentFacts", () => {
  it("builds matched, unmatched, and missing-receipt sections", () => {
    const message = aMailMessage();
    const receipt = aReceipt({ mailMessageId: message.id });
    const matchedTxn = aTransaction({
      userId,
      category: "shopping",
      merchantName: "Amazon",
      amount: Money.of(4599, "USD"),
      occurredAt: new Date("2026-05-20T12:00:00.000Z"),
    });
    const missingTxn = aTransaction({
      userId,
      category: "shopping",
      merchantName: "Target",
      amount: Money.of(3200, "USD"),
      occurredAt: new Date("2026-05-21T12:00:00.000Z"),
    });
    const unmatchedReceipt = aReceipt({
      merchantName: "DoorDash",
      totalAmount: Money.of(3240, "USD"),
    });
    const unmatchedMessage = aMailMessage({
      id: unmatchedReceipt.mailMessageId,
      receivedAt: new Date("2026-05-19T19:30:00.000Z"),
    });

    const link: TransactionReceiptLink = {
      userId,
      transactionId: matchedTxn.id,
      receiptId: receipt.id,
      matchScore: 92,
      matchReason: "exact amount + same day",
      linkedAt: new Date("2026-05-20T19:00:00.000Z"),
    };

    const input: ReceiptEnrichmentInput = {
      unmatchedReceipts: [unmatchedReceipt],
      mailMessageById: new Map([
        [message.id, message],
        [unmatchedMessage.id, unmatchedMessage],
      ]),
      transactionsInWindow: [matchedTxn, missingTxn],
      linksInWindow: [link],
      receiptById: new Map([
        [receipt.id, receipt],
        [unmatchedReceipt.id, unmatchedReceipt],
      ]),
    };

    const facts = buildReceiptEnrichmentFacts(input, receiptConfig);

    expect(facts.matchedReceipts).toHaveLength(1);
    expect(facts.matchedReceipts[0]?.merchantName).toBe("Amazon");
    expect(facts.matchedReceipts[0]?.chargeAmount).toBe("$45.99");

    expect(facts.unmatchedReceipts).toHaveLength(1);
    expect(facts.unmatchedReceipts[0]?.merchantName).toBe("DoorDash");
    expect(facts.unmatchedReceipts[0]?.reasonDetail.length).toBeGreaterThan(0);

    expect(facts.chargesMissingReceipts).toHaveLength(1);
    expect(facts.chargesMissingReceipts[0]?.merchantName).toBe("Target");
    expect(facts.chargesMissingReceipts[0]?.detail).toContain(
      "No order email found",
    );
  });
});
