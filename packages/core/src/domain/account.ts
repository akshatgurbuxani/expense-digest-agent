import type { AccountId, ItemId, UserId } from "../ids.js";

export interface Account {
  readonly id: AccountId;
  readonly itemId: ItemId;
  readonly userId: UserId;
  readonly plaidAccountId: string;
  readonly name: string;
  readonly type: string;
  readonly lastSyncedAt: Date | null;
}
