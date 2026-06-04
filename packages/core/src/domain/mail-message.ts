import type { MailAccountId, MailMessageId, UserId } from "../ids.js";
import type { ReceiptKind } from "./receipt-kind.js";

export type MailProcessingStatus =
  | "seen"
  | "ignored"
  | "classified"
  | "parsed"
  | "parse_failed"
  | "matched"
  | "deleted";

export interface MailMessage {
  readonly id: MailMessageId;
  readonly userId: UserId;
  readonly mailAccountId: MailAccountId;
  readonly gmailMessageId: string;
  readonly threadId: string;
  /** From Gmail internalDate (UTC), not the RFC Date header. */
  readonly receivedAt: Date;
  readonly fromAddress: string;
  readonly fromDomain: string;
  readonly subject: string;
  readonly processingStatus: MailProcessingStatus;
  readonly ignoreReason: string | null;
  readonly receiptKind: ReceiptKind | null;
}
