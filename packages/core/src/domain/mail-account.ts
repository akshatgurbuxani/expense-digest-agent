import type { MailAccountId, UserId } from "../ids.js";

export type MailAccountStatus = "active" | "needs_reauth" | "revoked" | "error";

export interface MailAccount {
  readonly id: MailAccountId;
  readonly userId: UserId;
  readonly gmailAddress: string;
  readonly status: MailAccountStatus;
  /** Last successfully processed history.list checkpoint (startHistoryId for next sync). */
  readonly historyId: string | null;
  readonly watchExpiresAt: Date | null;
  readonly lastSyncedAt: Date | null;
  readonly connectedAt: Date;
}
