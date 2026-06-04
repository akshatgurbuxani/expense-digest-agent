/** A single line item from a matched receipt, with amount serialized as display string. */
export interface MatchedReceiptLineItem {
  readonly description: string;
  readonly quantity: number | null;
  readonly amount: string | null;
}

/** Linked receipt + card charge pair for digest/report facts. */
export interface MatchedReceiptFact {
  readonly merchantName: string;
  readonly receiptAmount: string | null;
  readonly chargeAmount: string;
  readonly occurredAt: string;
  readonly orderId: string | null;
  readonly orderUrl: string | null;
  readonly lineItems: readonly MatchedReceiptLineItem[];
  readonly matchScore: number;
  readonly matchReason: string;
}
