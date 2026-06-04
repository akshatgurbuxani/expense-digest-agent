import type { Money } from "../money.js";
import type { ReceiptKind } from "../domain/receipt-kind.js";
import type { ReceiptLineItem } from "../domain/receipt.js";

export interface ReceiptExtractionInput {
  readonly kind: ReceiptKind;
  readonly fromAddress: string;
  readonly subject: string;
  readonly textPlain: string | null;
  readonly textHtml: string | null;
  readonly receivedAt: Date;
}

export interface ReceiptExtractionResult {
  readonly merchantName: string;
  readonly merchantDomain: string | null;
  readonly orderId: string | null;
  readonly orderUrl: string | null;
  readonly totalAmount: Money | null;
  readonly occurredAt: Date | null;
  readonly lineItems: readonly ReceiptLineItem[];
  readonly confidence: number;
  readonly source: "heuristic" | "llm";
}

export interface ReceiptExtractor {
  extract(input: ReceiptExtractionInput): Promise<ReceiptExtractionResult>;
}
