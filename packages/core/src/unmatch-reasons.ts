import type { ReceiptKind } from "./domain/receipt-kind.js";
import type {
  UnmatchReason,
  UnmatchedReceiptFact,
  UnmatchedReceiptMaybeTransaction,
} from "./domain/unmatched-receipt.js";
import type { Transaction } from "./domain/transaction.js";
import type {
  BestMatchSelection,
  ReceiptForMatch,
  ReceiptMatchConfig,
} from "./receipt-match-scorer.js";

export interface BuildUnmatchedFactInput {
  readonly receipt: ReceiptForMatch;
  readonly selection: BestMatchSelection;
  readonly parseConfidence: number;
  readonly minParseConfidence: number;
}

/** Human-readable detail for digest/report unmatched sections. */
export function unmatchReasonDetail(
  reason: UnmatchReason,
  receipt: ReceiptForMatch,
): string {
  switch (reason) {
    case "no_bank_activity":
      return `No card charges found near ${receipt.merchantName} in the match window.`;
    case "amount_mismatch":
      return `Receipt total does not align with any nearby charge for ${receipt.merchantName}.`;
    case "date_out_of_range":
      return `No charges dated within the expected window for this ${receipt.merchantName} receipt.`;
    case "merchant_unclear":
      return `Could not confidently match ${receipt.merchantName} to a merchant name on your card.`;
    case "low_parse_confidence":
      return `Receipt details for ${receipt.merchantName} were too uncertain to auto-link.`;
    case "multiple_candidates":
      return `Several charges could match ${receipt.merchantName}; none cleared the confidence bar.`;
  }
}

export function deriveUnmatchReason(
  input: BuildUnmatchedFactInput,
  config: ReceiptMatchConfig,
): UnmatchReason {
  if (input.parseConfidence < input.minParseConfidence) {
    return "low_parse_confidence";
  }

  const { ranked } = input.selection;
  if (ranked.length === 0) {
    return input.receipt.totalAmount === null
      ? "merchant_unclear"
      : "no_bank_activity";
  }

  const top = ranked[0]!;
  const second = ranked[1];
  if (
    second &&
    top.result.score >= config.minScore * 0.8 &&
    second.result.score >= config.minScore * 0.8 &&
    top.result.score - second.result.score < 10
  ) {
    return "multiple_candidates";
  }

  const topSignals = new Set(top.result.signals.map((s) => s.signal));
  if (topSignals.has("date_out_of_range") || top.result.score === 0) {
    return "date_out_of_range";
  }
  if (
    input.receipt.totalAmount !== null &&
    !topSignals.has("exactAmount") &&
    !topSignals.has("nearAmount")
  ) {
    return "amount_mismatch";
  }
  if (!topSignals.has("merchantFuzzy")) {
    return "merchant_unclear";
  }
  return "amount_mismatch";
}

export function explainWhyNotLinked(
  result: BestMatchSelection["ranked"][number]["result"],
  config: ReceiptMatchConfig,
): string {
  if (result.score >= config.minScore) return "";
  if (result.signals.some((s) => s.signal === "date_out_of_range")) {
    return result.summary;
  }
  const missing: string[] = [];
  const names = new Set(result.signals.map((s) => s.signal));
  if (!names.has("exactAmount") && !names.has("nearAmount")) {
    missing.push("amount differs");
  }
  if (!names.has("merchantFuzzy")) missing.push("merchant name differs");
  if (result.score < config.minScore) {
    missing.push(`score ${result.score} below ${config.minScore}`);
  }
  return missing.join("; ") || result.summary;
}

export function buildUnmatchedReceiptFact(
  input: BuildUnmatchedFactInput,
  config: ReceiptMatchConfig,
): UnmatchedReceiptFact {
  const reason = deriveUnmatchReason(input, config);
  const maybeTransactions = topMaybeTransactions(
    input.selection.ranked,
    config,
    2,
  );

  return {
    merchantName: input.receipt.merchantName,
    amount: input.receipt.totalAmount?.toDisplayString() ?? null,
    receivedAt: input.receipt.receivedAt.toISOString(),
    kind: input.receipt.kind,
    reason,
    reasonDetail: unmatchReasonDetail(reason, input.receipt),
    maybeTransactions,
  };
}

function topMaybeTransactions(
  ranked: BestMatchSelection["ranked"],
  config: ReceiptMatchConfig,
  limit: number,
): readonly UnmatchedReceiptMaybeTransaction[] {
  return ranked.slice(0, limit).map((candidate) => ({
    merchantName:
      candidate.transaction.merchantName ??
      candidate.transaction.merchantNameRaw,
    amount: candidate.transaction.amount.toDisplayString(),
    occurredAt: candidate.transaction.occurredAt.toISOString(),
    score: candidate.result.score,
    whyNot: explainWhyNotLinked(candidate.result, config),
  }));
}

export function formatUnmatchedForKind(kind: ReceiptKind): string {
  return kind.replace(/_/g, " ");
}

/** Reverse report line when a transaction has no linked receipt. */
export function noReceiptFoundCopy(merchantName: string): string {
  return `No order email found for this charge at ${merchantName}.`;
}

export function toReceiptForMatch(fields: {
  merchantName: string;
  totalAmount: import("./money.js").Money | null;
  occurredAt: Date | null;
  receivedAt: Date;
  orderId: string | null;
  kind: ReceiptKind;
}): ReceiptForMatch {
  return { ...fields };
}

export function transactionsInMatchWindow(
  transactions: readonly Transaction[],
  receipt: ReceiptForMatch,
  windowDays: number,
): Transaction[] {
  const anchor = receipt.occurredAt ?? receipt.receivedAt;
  const windowMs = windowDays * 86_400_000;
  return transactions.filter((t) => {
    const delta = Math.abs(t.occurredAt.getTime() - anchor.getTime());
    return delta <= windowMs;
  });
}
