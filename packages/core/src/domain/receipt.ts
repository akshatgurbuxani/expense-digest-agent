import type { Money } from "../money.js";
import type { MailMessageId, ReceiptId, UserId } from "../ids.js";
import type { ReceiptKind } from "./receipt-kind.js";

export interface ReceiptLineItem {
  readonly description: string;
  readonly quantity: number | null;
  readonly amount: Money | null;
}

export interface Receipt {
  readonly id: ReceiptId;
  readonly userId: UserId;
  readonly mailMessageId: MailMessageId;
  readonly kind: ReceiptKind;
  readonly merchantName: string;
  readonly merchantDomain: string | null;
  readonly orderId: string | null;
  readonly orderUrl: string | null;
  readonly totalAmount: Money | null;
  readonly occurredAt: Date | null;
  readonly lineItems: readonly ReceiptLineItem[];
  readonly extractedAt: Date;
  readonly extractionSource: "heuristic" | "llm";
  readonly confidence: number;
}
