/** Closed enum — classifier registry keys. See docs/gmail-receipt-enrichment.md §5.4. */
export const RECEIPT_KINDS = [
  "order_confirmation",
  "food_delivery",
  "rideshare",
  "subscription_renewal",
  "refund",
  "invoice_bill",
  "travel_booking",
  "event_ticket",
  "shipping_update",
  "marketplace_payment",
  "peer_transfer",
  "marketing",
  "bank_card_alert",
  "unknown",
] as const;

export type ReceiptKind = (typeof RECEIPT_KINDS)[number];

const EXCLUDED: ReadonlySet<ReceiptKind> = new Set([
  "marketing",
  "bank_card_alert",
]);

const PLAID_MATCH_KINDS: ReadonlySet<ReceiptKind> = new Set([
  "order_confirmation",
  "food_delivery",
  "rideshare",
  "subscription_renewal",
  "refund",
  "invoice_bill",
  "travel_booking",
  "event_ticket",
]);

/** Kinds that should never proceed to receipt.parse. */
export function isExcludedReceiptKind(kind: ReceiptKind): boolean {
  return EXCLUDED.has(kind);
}

/** Kinds we normally attempt to link to a Plaid transaction. */
export function shouldMatchReceiptToPlaid(kind: ReceiptKind): boolean {
  if (EXCLUDED.has(kind)) return false;
  if (kind === "peer_transfer" || kind === "unknown") return false;
  return PLAID_MATCH_KINDS.has(kind) || kind === "shipping_update" || kind === "marketplace_payment";
}
