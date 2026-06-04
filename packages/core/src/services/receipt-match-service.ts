import { NotFoundError, ValidationError } from "../errors.js";
import type { Category } from "../domain/category.js";
import type { Clock } from "../ports/clock.js";
import type {
  MailMessageRepository,
  ReceiptRepository,
  TransactionReceiptLinkRepository,
  TransactionRepository,
} from "../ports/repositories.js";
import type { ReceiptId, TransactionId, UserId } from "../ids.js";
import {
  scoreReceiptTransaction,
  selectBestTransactionMatch,
  type ReceiptForMatch,
  type ReceiptMatchConfig,
} from "../receipt-match-scorer.js";
import { toReceiptForMatch, transactionsInMatchWindow } from "../unmatch-reasons.js";
import type { Logger } from "../ports/logger.js";

export interface ReceiptMatchDeps {
  readonly transactions: TransactionRepository;
  readonly receipts: ReceiptRepository;
  readonly mailMessages: MailMessageRepository;
  readonly transactionReceiptLinks: TransactionReceiptLinkRepository;
  readonly clock: Clock;
  readonly matchConfig: ReceiptMatchConfig;
  readonly categoriesTriggerMatch: readonly Category[];
  readonly log?: Logger;
}

export function makeReceiptMatchService(deps: ReceiptMatchDeps) {
  return {
    async run(payload: {
      userId: UserId;
      receiptId?: ReceiptId;
      transactionId?: TransactionId;
    }): Promise<void> {
      const log = deps.log?.child({
        userId: payload.userId,
        receiptId: payload.receiptId,
        transactionId: payload.transactionId,
      });
      log?.info("receipt match service started");

      if (payload.receiptId) {
        await matchByReceipt(deps, payload.userId, payload.receiptId, log);
        return;
      }
      if (payload.transactionId) {
        await matchByTransaction(deps, payload.userId, payload.transactionId, log);
        return;
      }
      throw new ValidationError("receipt.match requires receiptId or transactionId");
    },
  };
}

async function matchByReceipt(
  deps: ReceiptMatchDeps,
  userId: UserId,
  receiptId: ReceiptId,
  log?: Logger,
): Promise<void> {
  const receipt = await deps.receipts.findById(userId, receiptId);
  if (!receipt) {
    log?.error("receipt not found");
    throw new NotFoundError(`receipt ${receiptId}`);
  }

  log?.info("matching receipt against transaction history", {
    merchantName: receipt.merchantName,
    totalAmount: receipt.totalAmount.toDisplayString(),
  });

  const existingLink = await deps.transactionReceiptLinks.findByReceiptId(userId, receiptId);
  if (existingLink) {
    log?.debug("receipt is already linked, skipping", { transactionId: existingLink.transactionId });
    return;
  }

  const message = await deps.mailMessages.findById(userId, receipt.mailMessageId);
  if (!message) {
    log?.error("mail message not found for receipt", { mailMessageId: receipt.mailMessageId });
    throw new NotFoundError(`mail message ${receipt.mailMessageId}`);
  }

  const receiptForMatch = toReceiptForMatch({
    merchantName: receipt.merchantName,
    totalAmount: receipt.totalAmount,
    occurredAt: receipt.occurredAt,
    receivedAt: message.receivedAt,
    orderId: receipt.orderId,
    kind: receipt.kind,
  });

  const allTxns = await deps.transactions.listForUser(userId);
  const txns = transactionsInMatchWindow(
    allTxns,
    receiptForMatch,
    deps.matchConfig.windowDays,
  );

  log?.debug(`found ${txns.length} transaction candidates in window`);

  const { best } = selectBestTransactionMatch(
    receiptForMatch,
    txns,
    deps.matchConfig,
  );
  if (!best) {
    log?.info("no suitable transaction match found for receipt");
    return;
  }

  log?.info("best transaction match resolved", {
    transactionId: best.transaction.id,
    merchantName: best.transaction.merchantName,
    amount: best.transaction.amount.toDisplayString(),
    score: best.result.score,
    summary: best.result.summary,
  });

  const txnLink = await deps.transactionReceiptLinks.findByTransactionId(userId, best.transaction.id);
  if (txnLink) {
    log?.warn("resolved best transaction is already linked to another receipt, skipping link creation", {
      otherReceiptId: txnLink.receiptId,
    });
    return;
  }

  await deps.transactionReceiptLinks.link({
    userId,
    transactionId: best.transaction.id,
    receiptId,
    matchScore: best.result.score,
    matchReason: best.result.summary,
    linkedAt: deps.clock.now(),
  });

  await deps.mailMessages.updateClassification(userId, receipt.mailMessageId, {
    processingStatus: "matched",
    receiptKind: receipt.kind,
    ignoreReason: null,
  });

  log?.info("receipt successfully linked to transaction");
}

async function matchByTransaction(
  deps: ReceiptMatchDeps,
  userId: UserId,
  transactionId: TransactionId,
  log?: Logger,
): Promise<void> {
  const txn = await deps.transactions.findById(userId, transactionId);
  if (!txn) {
    log?.error("transaction not found");
    throw new NotFoundError(`transaction ${transactionId}`);
  }

  log?.info("matching transaction against unmatched receipts", {
    merchantNameRaw: txn.merchantNameRaw,
    amount: txn.amount.toDisplayString(),
    category: txn.category,
  });

  const existingLink = await deps.transactionReceiptLinks.findByTransactionId(userId, transactionId);
  if (existingLink) {
    log?.debug("transaction is already linked, skipping", { receiptId: existingLink.receiptId });
    return;
  }

  if (
    txn.category !== null &&
    !deps.categoriesTriggerMatch.includes(txn.category)
  ) {
    log?.debug("transaction category does not trigger match, skipping", { category: txn.category });
    return;
  }

  const anchor = txn.occurredAt;
  const windowMs = deps.matchConfig.windowDays * 86_400_000;
  const start = new Date(anchor.getTime() - windowMs);
  const end = new Date(anchor.getTime() + windowMs + 1);

  const candidates = await deps.receipts.listUnmatchedInWindow(
    userId,
    start,
    end,
  );

  log?.debug(`found ${candidates.length} unmatched receipt candidates in window`);

  let bestReceipt: ReceiptId | null = null;
  let bestScore = 0;
  let bestSummary = "";

  for (const receipt of candidates) {
    const message = await deps.mailMessages.findById(userId, receipt.mailMessageId);
    if (!message) continue;

    const receiptForMatch = toReceiptForMatch({
      merchantName: receipt.merchantName,
      totalAmount: receipt.totalAmount,
      occurredAt: receipt.occurredAt,
      receivedAt: message.receivedAt,
      orderId: receipt.orderId,
      kind: receipt.kind,
    });

    const result = scoreReceiptTransaction(receiptForMatch, txn, deps.matchConfig);
    log?.debug("evaluated receipt candidate", {
      receiptId: receipt.id,
      merchantName: receipt.merchantName,
      score: result.score,
      summary: result.summary,
    });

    if (result.score > bestScore) {
      bestScore = result.score;
      bestReceipt = receipt.id;
      bestSummary = result.summary;
    }
  }

  if (!bestReceipt || bestScore < deps.matchConfig.minScore) {
    log?.info("no receipt match found above minimum score threshold", {
      bestScore,
      minScore: deps.matchConfig.minScore,
    });
    return;
  }

  log?.info("resolved best receipt match", {
    receiptId: bestReceipt,
    score: bestScore,
    summary: bestSummary,
  });

  await deps.transactionReceiptLinks.link({
    userId,
    transactionId,
    receiptId: bestReceipt,
    matchScore: bestScore,
    matchReason: bestSummary,
    linkedAt: deps.clock.now(),
  });

  const linked = await deps.receipts.findById(userId, bestReceipt);
  if (linked) {
    await deps.mailMessages.updateClassification(userId, linked.mailMessageId, {
      processingStatus: "matched",
      receiptKind: linked.kind,
      ignoreReason: null,
    });
  }

  log?.info("transaction successfully linked to receipt");
}
