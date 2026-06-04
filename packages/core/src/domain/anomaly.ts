import type { AnomalyId, TransactionId, UserId } from "../ids.js";

export type AnomalyReason =
  | "price_increase"
  | "duplicate_charge"
  | "new_subscription"
  | "unusual_spend";

export type Severity = "low" | "high";

export interface Anomaly {
  readonly id: AnomalyId;
  readonly userId: UserId;
  readonly transactionId: TransactionId;
  readonly reason: AnomalyReason;
  readonly severity: Severity;
  readonly detail: string;
  readonly detectedAt: Date;
  readonly deliveredAt: Date | null;
}

/** A detector verdict before persistence (no id yet). */
export interface AnomalyVerdict {
  readonly reason: AnomalyReason;
  readonly severity: Severity;
  readonly detail: string;
}
