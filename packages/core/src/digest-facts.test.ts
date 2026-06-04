import { describe, it, expect } from "vitest";
import { Money } from "./money.js";
import { buildDigestFacts } from "./digest-facts.js";
import { TEST_DIGEST_FACTS_CONFIG, TEST_RECEIPT_MATCH_CONFIG } from "./testing/tunables.js";
import { aTransaction } from "./testing/builders.js";
import type { SpendBaseline } from "./domain/baseline.js";
import type { Receipt } from "./domain/receipt.js";
import { newId } from "./ids.js";

const userId = newId<"UserId">();

function baseline(
  category: SpendBaseline["category"],
  meanMinor: number,
  sampleCount: number,
): SpendBaseline {
  return {
    userId,
    category,
    period: "weekly",
    mean: Money.of(meanMinor, "USD"),
    median: Money.of(meanMinor, "USD"),
    stddevMinorUnits: 100,
    sampleCount,
    computedAt: new Date(),
  };
}

const cfg = TEST_DIGEST_FACTS_CONFIG;
const minBaselineSamples = cfg.minBaselineSamples;

describe("buildDigestFacts", () => {
  it("computes totals, shares, and formatted amounts", () => {
    const facts = buildDigestFacts(
      {
        firstName: "Alex",
        currency: "USD",
        window: { startLabel: "May 19", endLabel: "May 25" },
        transactions: [
          aTransaction({ category: "groceries", amount: Money.of(4000, "USD") }),
          aTransaction({ category: "dining", amount: Money.of(6000, "USD") }),
        ],
        baselines: [],
        anomalies: [],
      },
      cfg,
    );

    expect(facts.totalSpend).toBe("$100.00");
    expect(facts.categories).toHaveLength(2);
    const groceries = facts.categories.find((c) => c.category === "groceries");
    expect(groceries?.amount).toBe("$40.00");
    expect(groceries?.share).toBe("40%");
  });

  it('sets maturity to "learning" and nulls vsBaseline when sample size is insufficient', () => {
    const facts = buildDigestFacts(
      {
        firstName: null,
        currency: "USD",
        window: { startLabel: "May 19", endLabel: "May 25" },
        transactions: [
          aTransaction({ category: "groceries", amount: Money.of(5000, "USD") }),
        ],
        baselines: [baseline("groceries", 4000, minBaselineSamples - 1)],
        anomalies: [],
      },
      cfg,
    );

    expect(facts.maturity).toBe("learning");
    expect(facts.totalSpendVsBaseline).toBeNull();
    expect(facts.categories[0]?.vsBaseline).toBeNull();
  });

  it('sets maturity to "established" and computes trends when baselines are mature', () => {
    const facts = buildDigestFacts(
      {
        firstName: "Alex",
        currency: "USD",
        window: { startLabel: "May 19", endLabel: "May 25" },
        transactions: [
          aTransaction({ category: "groceries", amount: Money.of(5200, "USD") }),
        ],
        baselines: [baseline("groceries", 4000, minBaselineSamples)],
        anomalies: [],
      },
      cfg,
    );

    expect(facts.maturity).toBe("established");
    expect(facts.categories[0]?.vsBaseline?.direction).toBe("up");
    expect(facts.categories[0]?.vsBaseline?.baselineAmount).toBe("$40.00");
  });

  it("includes pre-written anomaly rows with formatted amounts", () => {
    const facts = buildDigestFacts(
      {
        firstName: "Alex",
        currency: "USD",
        window: { startLabel: "May 19", endLabel: "May 25" },
        transactions: [],
        baselines: [],
        anomalies: [
          {
            reason: "duplicate_charge",
            detail: "Duplicate Netflix charge",
            amount: Money.of(1599, "USD"),
          },
        ],
      },
      cfg,
    );

    expect(facts.anomalies[0]?.amount).toBe("$15.99");
    expect(facts.anomalies[0]?.detail).toBe("Duplicate Netflix charge");
  });

  it("ignores transactions without a category or that are soft-deleted", () => {
    const facts = buildDigestFacts(
      {
        firstName: "Alex",
        currency: "USD",
        window: { startLabel: "May 19", endLabel: "May 25" },
        transactions: [
          aTransaction({ category: null, amount: Money.of(9999, "USD") }),
          aTransaction({
            category: "dining",
            amount: Money.of(1000, "USD"),
            removedAt: new Date(),
          }),
        ],
        baselines: [],
        anomalies: [],
      },
      cfg,
    );

    expect(facts.totalSpend).toBe("$0.00");
    expect(facts.categories).toHaveLength(0);
  });

  it("includes receipt enrichment sections when provided", () => {
    const messageId = newId<"MailMessageId">();
    const receipt: Receipt = {
      id: newId<"ReceiptId">(),
      userId,
      mailMessageId: messageId,
      kind: "order_confirmation",
      merchantName: "Amazon",
      merchantDomain: "amazon.com",
      orderId: null,
      orderUrl: null,
      totalAmount: Money.of(4599, "USD"),
      occurredAt: new Date("2026-05-20T18:00:00.000Z"),
      lineItems: [],
      extractedAt: new Date("2026-05-20T18:10:00.000Z"),
      extractionSource: "llm",
      confidence: 0.9,
    };

    const facts = buildDigestFacts(
      {
        firstName: "Alex",
        currency: "USD",
        window: { startLabel: "May 19", endLabel: "May 25" },
        transactions: [],
        baselines: [],
        anomalies: [],
        receiptEnrichment: {
          input: {
            unmatchedReceipts: [receipt],
            mailMessageById: new Map([
              [
                messageId,
                {
                  id: messageId,
                  userId,
                  mailAccountId: newId<"MailAccountId">(),
                  gmailMessageId: "gmail-1",
                  threadId: "thread-1",
                  receivedAt: new Date("2026-05-20T18:05:00.000Z"),
                  fromAddress: "Amazon <order-update@amazon.com>",
                  fromDomain: "amazon.com",
                  subject: "Order",
                  processingStatus: "parsed",
                  ignoreReason: null,
                  receiptKind: "order_confirmation",
                },
              ],
            ]),
            transactionsInWindow: [],
            linksInWindow: [],
            receiptById: new Map([[receipt.id, receipt]]),
          },
          config: {
            matchConfig: TEST_RECEIPT_MATCH_CONFIG,
            minParseConfidence: 0.75,
            categoriesTriggerMatch: ["shopping"],
          },
        },
      },
      cfg,
    );

    expect(facts.unmatchedReceipts).toHaveLength(1);
    expect(facts.unmatchedReceipts[0]?.merchantName).toBe("Amazon");
  });
});
