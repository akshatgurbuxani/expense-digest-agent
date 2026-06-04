import type { Money } from "../money.js";
import type { AccountId, TransactionId, UserId } from "../ids.js";
import type { Category } from "./category.js";

export interface Transaction {
  readonly id: TransactionId;
  readonly accountId: AccountId;
  readonly userId: UserId;
  readonly plaidTransactionId: string;
  readonly amount: Money;
  readonly merchantNameRaw: string;
  readonly merchantName: string | null;
  readonly category: Category | null;
  readonly plaidPfc: string | null;
  readonly isSubscription: boolean;
  readonly isRecurring: boolean;
  readonly occurredAt: Date;
  readonly enrichedAt: Date | null;
  readonly removedAt: Date | null;
}
