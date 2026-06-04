import type { MailProcessingStatus } from "../domain/mail-message.js";
import type { ReceiptKind } from "../domain/receipt-kind.js";
import type { Category } from "../domain/category.js";
import type { FakeMailMessage, FakeMailOptions } from "./fake-mail.js";

/** Plaid charge seed for a pipeline scenario — mapped to `aTransaction()` in the runner. */
export interface ReceiptPipelineScenarioSeedTxn {
  readonly merchantName: string;
  readonly category: Category;
  readonly amountMinorUnits: number;
  readonly occurredAt?: Date;
}

export interface ReceiptPipelineScenarioExpect {
  readonly processingStatus: MailProcessingStatus;
  readonly receiptKind: ReceiptKind | null;
  readonly receiptExists: boolean;
  readonly linked: boolean;
  /** When set, runner saves this history id before sync (triggers fullSync on expiry). */
  readonly fullSyncEnqueued?: boolean;
  readonly totalAmountMinorUnits?: number | null;
  readonly ignoreReasonContains?: string;
}

/**
 * Declarative mail.sync → parse → match scenario.
 * Data only — no test framework imports; reusable by e2e and demo scripts later.
 */
export interface ReceiptPipelineScenario {
  readonly id: string;
  readonly description: string;
  readonly gmailMessageId: string;
  readonly message: FakeMailMessage;
  readonly expiredHistoryId?: string;
  readonly seedTransactions?: readonly ReceiptPipelineScenarioSeedTxn[];
  /** Run mail.sync twice to assert idempotent ingest. */
  readonly runSyncTwice?: boolean;
  readonly expect: ReceiptPipelineScenarioExpect;
}

const RECEIVED_AT = new Date("2026-05-20T18:00:00.000Z");
const TXN_AT = new Date("2026-05-20T12:00:00.000Z");

export const RECEIPT_PIPELINE_SCENARIOS: readonly ReceiptPipelineScenario[] = [
  {
    id: "amazon-happy-path",
    description: "Known merchant receipt links to matching Plaid charge",
    gmailMessageId: "gmail-amazon-1",
    message: {
      gmailMessageId: "gmail-amazon-1",
      threadId: "thread-amazon",
      receivedAt: RECEIVED_AT,
      fromAddress: "Amazon <order-update@amazon.com>",
      subject: "Your Amazon.com order has shipped",
      snippet: "Package on the way",
      labelIds: ["INBOX"],
      textPlain: "Order total: $45.99\nThanks for shopping.",
      textHtml: null,
    },
    seedTransactions: [
      {
        merchantName: "Amazon",
        category: "shopping",
        amountMinorUnits: 4599,
        occurredAt: TXN_AT,
      },
    ],
    expect: {
      processingStatus: "matched",
      receiptKind: "order_confirmation",
      receiptExists: true,
      linked: true,
      totalAmountMinorUnits: 4599,
    },
  },
  {
    id: "unknown-target-matches",
    description: "Unlisted merchant domain still parses as unknown and can match",
    gmailMessageId: "gmail-target-1",
    message: {
      gmailMessageId: "gmail-target-1",
      threadId: "thread-target",
      receivedAt: RECEIVED_AT,
      fromAddress: "Target <orders@target.com>",
      subject: "Thanks for your Target order",
      snippet: null,
      labelIds: ["INBOX"],
      textPlain: "Order total: $32.00",
      textHtml: null,
    },
    seedTransactions: [
      {
        merchantName: "Target",
        category: "shopping",
        amountMinorUnits: 3200,
        occurredAt: TXN_AT,
      },
    ],
    expect: {
      processingStatus: "matched",
      receiptKind: "unknown",
      receiptExists: true,
      linked: true,
      totalAmountMinorUnits: 3200,
    },
  },
  {
    id: "marketing-promo-ignored",
    description: "Promotional subject is classified as marketing and excluded",
    gmailMessageId: "gmail-promo-1",
    message: {
      gmailMessageId: "gmail-promo-1",
      threadId: "thread-promo",
      receivedAt: RECEIVED_AT,
      fromAddress: "Shop <shop@store.com>",
      subject: "50% off — sale ends tonight",
      snippet: null,
      labelIds: ["INBOX"],
      textPlain: "Shop our sale.",
      textHtml: null,
    },
    expect: {
      processingStatus: "ignored",
      receiptKind: "marketing",
      receiptExists: false,
      linked: false,
      ignoreReasonContains: "excluded_kind:marketing",
    },
  },
  {
    id: "bank-alert-ignored",
    description: "Bank card alert sender is ignored before parse",
    gmailMessageId: "gmail-chase-1",
    message: {
      gmailMessageId: "gmail-chase-1",
      threadId: "thread-chase",
      receivedAt: RECEIVED_AT,
      fromAddress: "Chase <alerts@chase.com>",
      subject: "Your purchase at Amazon",
      snippet: "Card ending 1234",
      labelIds: ["INBOX"],
      textPlain: "You made a purchase of $45.99",
      textHtml: null,
    },
    expect: {
      processingStatus: "ignored",
      receiptKind: null,
      receiptExists: false,
      linked: false,
      ignoreReasonContains: "bank_card_alert_from",
    },
  },
  {
    id: "no-amount-stays-unmatched",
    description: "Receipt without a total parses but does not auto-link",
    gmailMessageId: "gmail-thanks-1",
    message: {
      gmailMessageId: "gmail-thanks-1",
      threadId: "thread-thanks",
      receivedAt: RECEIVED_AT,
      fromAddress: "Store <orders@example.com>",
      subject: "Thanks for your purchase",
      snippet: null,
      labelIds: ["INBOX"],
      textPlain: "Thanks for your purchase. We'll email you when it ships.",
      textHtml: null,
    },
    seedTransactions: [
      {
        merchantName: "Example Store",
        category: "shopping",
        amountMinorUnits: 2500,
        occurredAt: TXN_AT,
      },
    ],
    expect: {
      processingStatus: "parsed",
      receiptKind: "unknown",
      receiptExists: true,
      linked: false,
      totalAmountMinorUnits: null,
    },
  },
  {
    id: "amount-mismatch-no-link",
    description: "Parsed receipt amount that differs from Plaid charge stays unmatched",
    gmailMessageId: "gmail-amazon-mismatch",
    message: {
      gmailMessageId: "gmail-amazon-mismatch",
      threadId: "thread-mismatch",
      receivedAt: RECEIVED_AT,
      fromAddress: "Amazon <order-update@amazon.com>",
      subject: "Your Amazon.com order has shipped",
      snippet: null,
      labelIds: ["INBOX"],
      textPlain: "Order total: $45.99",
      textHtml: null,
    },
    seedTransactions: [
      {
        merchantName: "Amazon",
        category: "shopping",
        amountMinorUnits: 5000,
        occurredAt: TXN_AT,
      },
    ],
    expect: {
      processingStatus: "parsed",
      receiptKind: "order_confirmation",
      receiptExists: true,
      linked: false,
      totalAmountMinorUnits: 4599,
    },
  },
  {
    id: "duplicate-sync-idempotent",
    description: "Second mail.sync for the same gmail message id is a no-op",
    gmailMessageId: "gmail-dup-1",
    runSyncTwice: true,
    message: {
      gmailMessageId: "gmail-dup-1",
      threadId: "thread-dup",
      receivedAt: RECEIVED_AT,
      fromAddress: "Amazon <order-update@amazon.com>",
      subject: "Your Amazon.com order has shipped",
      snippet: null,
      labelIds: ["INBOX"],
      textPlain: "Order total: $45.99",
      textHtml: null,
    },
    seedTransactions: [
      {
        merchantName: "Amazon",
        category: "shopping",
        amountMinorUnits: 4599,
        occurredAt: TXN_AT,
      },
    ],
    expect: {
      processingStatus: "matched",
      receiptKind: "order_confirmation",
      receiptExists: true,
      linked: true,
      totalAmountMinorUnits: 4599,
    },
  },
  {
    id: "expired-history-fullsync-backfill",
    description: "Expired history checkpoint triggers fullSync backfill",
    gmailMessageId: "gmail-backfill-1",
    expiredHistoryId: "expired-scenario-1",
    message: {
      gmailMessageId: "gmail-backfill-1",
      threadId: "thread-backfill",
      receivedAt: new Date("2026-05-19T18:00:00.000Z"),
      fromAddress: "DoorDash <noreply@doordash.com>",
      subject: "Your receipt from Chipotle",
      snippet: null,
      labelIds: ["INBOX"],
      textPlain: "Order total: $18.50",
      textHtml: null,
    },
    expect: {
      processingStatus: "parsed",
      receiptKind: "food_delivery",
      receiptExists: true,
      linked: false,
      fullSyncEnqueued: true,
      totalAmountMinorUnits: 1850,
    },
  },
] as const;

export function receiptScenarioById(id: string): ReceiptPipelineScenario {
  const scenario = RECEIPT_PIPELINE_SCENARIOS.find((entry) => entry.id === id);
  if (!scenario) {
    throw new Error(`unknown receipt pipeline scenario: ${id}`);
  }
  return scenario;
}

/** Build `makeFakeMailProvider` options for a single-message incremental or backfill sync. */
export function mailOptionsForScenario(
  scenario: ReceiptPipelineScenario,
): FakeMailOptions {
  const messages = { [scenario.gmailMessageId]: scenario.message };

  if (scenario.expiredHistoryId) {
    return {
      expiredHistoryId: scenario.expiredHistoryId,
      listPages: [
        {
          messageIds: [scenario.gmailMessageId],
          nextPageToken: null,
        },
      ],
      messages,
    };
  }

  return {
    changePages: [
      {
        candidateMessageIds: [scenario.gmailMessageId],
        deletedMessageIds: [],
        nextHistoryId: `${scenario.gmailMessageId}-next`,
      },
    ],
    messages,
  };
}
