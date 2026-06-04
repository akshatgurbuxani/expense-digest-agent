import type { ReceiptKind } from "./receipt-kind.js";

export type UnmatchReason =
  | "no_bank_activity"
  | "amount_mismatch"
  | "date_out_of_range"
  | "merchant_unclear"
  | "low_parse_confidence"
  | "multiple_candidates";

export interface UnmatchedReceiptMaybeTransaction {
  readonly merchantName: string;
  readonly amount: string;
  readonly occurredAt: string;
  readonly score: number;
  readonly whyNot: string;
}

export interface UnmatchedReceiptFact {
  readonly merchantName: string;
  readonly amount: string | null;
  readonly receivedAt: string;
  readonly kind: ReceiptKind;
  readonly reason: UnmatchReason;
  readonly reasonDetail: string;
  readonly maybeTransactions: readonly UnmatchedReceiptMaybeTransaction[];
}
