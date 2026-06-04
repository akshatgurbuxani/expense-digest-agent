import { Money } from "./money.js";
import { normalizeMerchant } from "./merchant.js";
import type { Category } from "./domain/category.js";
import type { ReceiptKind } from "./domain/receipt-kind.js";
import type { Transaction } from "./domain/transaction.js";

export interface ReceiptMatchWeights {
  readonly exactAmount: number;
  readonly nearAmount: number;
  readonly sameDay: number;
  readonly nearDay: number;
  readonly merchantFuzzy: number;
  readonly orderIdInMemo: number;
  readonly categoryBonus: number;
}

/** Tunable thresholds — values come from config YAML only. */
export interface ReceiptMatchConfig {
  readonly windowDays: number;
  readonly amountToleranceMinorUnits: number;
  readonly minScore: number;
  readonly weights: ReceiptMatchWeights;
  readonly categoryBonusCategories: readonly Category[];
}

export interface ReceiptForMatch {
  readonly merchantName: string;
  readonly totalAmount: Money | null;
  readonly occurredAt: Date | null;
  readonly receivedAt: Date;
  readonly orderId: string | null;
  readonly kind: ReceiptKind;
}

export interface MatchSignal {
  readonly signal: string;
  readonly points: number;
}

export interface MatchScoreResult {
  readonly score: number;
  readonly signals: readonly MatchSignal[];
  readonly summary: string;
}

const MS_PER_DAY = 86_400_000;

export function receiptAnchorDate(receipt: ReceiptForMatch): Date {
  return receipt.occurredAt ?? receipt.receivedAt;
}

export function scoreReceiptTransaction(
  receipt: ReceiptForMatch,
  transaction: Transaction,
  config: ReceiptMatchConfig,
): MatchScoreResult {
  const signals: MatchSignal[] = [];
  const anchor = receiptAnchorDate(receipt);
  const dayDelta = Math.abs(
    startOfUtcDay(transaction.occurredAt).getTime() -
      startOfUtcDay(anchor).getTime(),
  );
  const dayDiff = Math.round(dayDelta / MS_PER_DAY);

  if (dayDiff > config.windowDays) {
    return {
      score: 0,
      signals: [{ signal: "date_out_of_range", points: 0 }],
      summary: `transaction ${dayDiff} days from receipt (window ${config.windowDays})`,
    };
  }

  if (dayDiff === 0) {
    signals.push({ signal: "sameDay", points: config.weights.sameDay });
  } else {
    signals.push({ signal: "nearDay", points: config.weights.nearDay });
  }

  if (receipt.totalAmount !== null) {
    const diff = Math.abs(
      receipt.totalAmount.minorUnits - transaction.amount.minorUnits,
    );
    if (diff === 0) {
      signals.push({ signal: "exactAmount", points: config.weights.exactAmount });
    } else if (diff <= config.amountToleranceMinorUnits) {
      signals.push({ signal: "nearAmount", points: config.weights.nearAmount });
    }
  }

  const txnMerchant = normalizeMerchant(
    transaction.merchantName ?? transaction.merchantNameRaw,
  );
  const receiptMerchant = normalizeMerchant(receipt.merchantName);
  if (
    txnMerchant.includes(receiptMerchant) ||
    receiptMerchant.includes(txnMerchant) ||
    tokenOverlap(txnMerchant, receiptMerchant) >= 0.5
  ) {
    signals.push({ signal: "merchantFuzzy", points: config.weights.merchantFuzzy });
  }

  if (receipt.orderId) {
    const memo = `${transaction.merchantNameRaw} ${transaction.merchantName ?? ""}`;
    if (memo.toLowerCase().includes(receipt.orderId.toLowerCase())) {
      signals.push({
        signal: "orderIdInMemo",
        points: config.weights.orderIdInMemo,
      });
    }
  }

  if (
    transaction.category !== null &&
    config.categoryBonusCategories.includes(transaction.category)
  ) {
    signals.push({
      signal: "categoryBonus",
      points: config.weights.categoryBonus,
    });
  }

  const score = signals.reduce((sum, s) => sum + s.points, 0);
  const summary = signals.map((s) => `${s.signal}(+${s.points})`).join(", ");
  return { score, signals, summary: summary || "no signals" };
}

export interface RankedMatchCandidate {
  readonly transaction: Transaction;
  readonly result: MatchScoreResult;
}

export interface BestMatchSelection {
  readonly best: RankedMatchCandidate | null;
  readonly ranked: readonly RankedMatchCandidate[];
}

/** Rank transactions by score descending; best must meet minScore. */
export function selectBestTransactionMatch(
  receipt: ReceiptForMatch,
  transactions: readonly Transaction[],
  config: ReceiptMatchConfig,
): BestMatchSelection {
  const ranked = transactions
    .map((transaction) => ({
      transaction,
      result: scoreReceiptTransaction(receipt, transaction, config),
    }))
    .filter((c) => c.result.score > 0)
    .sort((a, b) => b.result.score - a.result.score);

  const top = ranked[0];
  if (!top || top.result.score < config.minScore) {
    return { best: null, ranked };
  }
  return { best: top, ranked };
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function tokenOverlap(a: string, b: string): number {
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = b.split(" ").filter(Boolean);
  if (aTokens.size === 0 || bTokens.length === 0) return 0;
  let shared = 0;
  for (const t of bTokens) {
    if (aTokens.has(t)) shared += 1;
  }
  return shared / Math.max(aTokens.size, bTokens.length);
}
