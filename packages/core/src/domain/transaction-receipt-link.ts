import type { ReceiptId, TransactionId, UserId } from "../ids.js";

export interface TransactionReceiptLink {
  readonly userId: UserId;
  readonly transactionId: TransactionId;
  readonly receiptId: ReceiptId;
  readonly matchScore: number;
  readonly matchReason: string;
  readonly linkedAt: Date;
}
