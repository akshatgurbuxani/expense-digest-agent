import type { ItemId, UserId } from "../ids.js";

export type ItemStatus = "good" | "needs_reauth" | "error";

export interface Item {
  readonly id: ItemId;
  readonly userId: UserId;
  readonly plaidItemId: string;
  readonly status: ItemStatus;
  readonly syncCursor: string | null;
  readonly lastSyncedAt: Date | null;
}
