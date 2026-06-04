import type { Category } from "./domain/category.js";
import type { MailMessage } from "./domain/mail-message.js";
import type { Receipt } from "./domain/receipt.js";
import type { Transaction } from "./domain/transaction.js";
import type { TransactionReceiptLink } from "./domain/transaction-receipt-link.js";
import type { ChargeMissingReceiptFact } from "./domain/charge-missing-receipt.js";
import type { MatchedReceiptFact } from "./domain/matched-receipt.js";
import type { UnmatchedReceiptFact } from "./domain/unmatched-receipt.js";
import type { MailMessageId, ReceiptId, TransactionId } from "./ids.js";
import {
  selectBestTransactionMatch,
  type ReceiptMatchConfig,
} from "./receipt-match-scorer.js";
import {
  buildUnmatchedReceiptFact,
  noReceiptFoundCopy,
  toReceiptForMatch,
  transactionsInMatchWindow,
} from "./unmatch-reasons.js";

export interface ReceiptEnrichmentConfig {
  readonly matchConfig: ReceiptMatchConfig;
  readonly minParseConfidence: number;
  readonly categoriesTriggerMatch: readonly Category[];
}

export interface ReceiptEnrichmentInput {
  readonly unmatchedReceipts: readonly Receipt[];
  readonly mailMessageById: ReadonlyMap<MailMessageId, MailMessage>;
  readonly transactionsInWindow: readonly Transaction[];
  readonly linksInWindow: readonly TransactionReceiptLink[];
  readonly receiptById: ReadonlyMap<ReceiptId, Receipt>;
}

export interface ReceiptEnrichmentFacts {
  readonly matchedReceipts: readonly MatchedReceiptFact[];
  readonly unmatchedReceipts: readonly UnmatchedReceiptFact[];
  readonly chargesMissingReceipts: readonly ChargeMissingReceiptFact[];
}

/** Pure: receipts + links + transactions → matched/unmatched/missing sections. */
export function buildReceiptEnrichmentFacts(
  input: ReceiptEnrichmentInput,
  config: ReceiptEnrichmentConfig,
): ReceiptEnrichmentFacts {
  const txnById = new Map(
    input.transactionsInWindow.map((txn) => [txn.id, txn] as const),
  );
  const linkedTxnIds = new Set(
    input.linksInWindow.map((link) => link.transactionId),
  );

  const matchedReceipts = input.linksInWindow
    .map((link) => buildMatchedFact(link, input, txnById))
    .filter((fact): fact is MatchedReceiptFact => fact !== null)
    .sort(byOccurredAt);

  const unmatchedReceipts = input.unmatchedReceipts
    .map((receipt) =>
      buildUnmatchedFact(receipt, input, config, input.transactionsInWindow),
    )
    .filter((fact): fact is UnmatchedReceiptFact => fact !== null)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

  const chargesMissingReceipts = input.transactionsInWindow
    .filter(
      (txn) =>
        txn.category !== null &&
        txn.removedAt === null &&
        config.categoriesTriggerMatch.includes(txn.category) &&
        !linkedTxnIds.has(txn.id),
    )
    .map((txn) => ({
      merchantName: txn.merchantName ?? txn.merchantNameRaw,
      amount: txn.amount.toDisplayString(),
      occurredAt: txn.occurredAt.toISOString(),
      category: txn.category!,
      detail: noReceiptFoundCopy(txn.merchantName ?? txn.merchantNameRaw),
    }))
    .sort(byOccurredAt);

  return { matchedReceipts, unmatchedReceipts, chargesMissingReceipts };
}

function buildMatchedFact(
  link: TransactionReceiptLink,
  input: ReceiptEnrichmentInput,
  txnById: ReadonlyMap<TransactionId, Transaction>,
): MatchedReceiptFact | null {
  const receipt = input.receiptById.get(link.receiptId);
  const txn = txnById.get(link.transactionId);
  if (!receipt || !txn) return null;

  return {
    merchantName: receipt.merchantName,
    receiptAmount: receipt.totalAmount?.toDisplayString() ?? null,
    chargeAmount: txn.amount.toDisplayString(),
    occurredAt: txn.occurredAt.toISOString(),
    orderId: receipt.orderId,
    orderUrl: receipt.orderUrl,
    lineItems: receipt.lineItems.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      amount: li.amount?.toDisplayString() ?? null,
    })),
    matchScore: link.matchScore,
    matchReason: link.matchReason,
  };
}

function buildUnmatchedFact(
  receipt: Receipt,
  input: ReceiptEnrichmentInput,
  config: ReceiptEnrichmentConfig,
  transactions: readonly Transaction[],
): UnmatchedReceiptFact | null {
  const message = input.mailMessageById.get(receipt.mailMessageId);
  if (!message) return null;

  const receiptForMatch = toReceiptForMatch({
    merchantName: receipt.merchantName,
    totalAmount: receipt.totalAmount,
    occurredAt: receipt.occurredAt,
    receivedAt: message.receivedAt,
    orderId: receipt.orderId,
    kind: receipt.kind,
  });

  const candidates = transactionsInMatchWindow(
    transactions,
    receiptForMatch,
    config.matchConfig.windowDays,
  );
  const selection = selectBestTransactionMatch(
    receiptForMatch,
    candidates,
    config.matchConfig,
  );

  return buildUnmatchedReceiptFact(
    {
      receipt: receiptForMatch,
      selection,
      parseConfidence: receipt.confidence,
      minParseConfidence: config.minParseConfidence,
    },
    config.matchConfig,
  );
}

function byOccurredAt(a: { occurredAt: string }, b: { occurredAt: string }): number {
  return a.occurredAt.localeCompare(b.occurredAt);
}
