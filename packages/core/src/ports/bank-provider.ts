import type { Money } from "../money.js";
import type { UserId } from "../ids.js";

/** Adapter edge type — mapped to domain `Transaction` by the sync worker. */
export interface RawTransaction {
  readonly plaidTransactionId: string;
  readonly plaidAccountId: string;
  readonly amount: Money;
  readonly merchantNameRaw: string;
  readonly plaidPfc: string | null;
  readonly occurredAt: Date;
}

export interface SyncPage {
  readonly added: RawTransaction[];
  readonly modified: RawTransaction[];
  readonly removed: string[];
  readonly nextCursor: string;
  readonly hasMore: boolean;
}

export interface VerifiedWebhook {
  readonly itemId: string;
  readonly type: string;
  readonly code: string;
}

export interface BankProvider {
  createLinkToken(userId: UserId): Promise<{ linkToken: string; expiration: Date }>;

  exchangePublicToken(publicToken: string): Promise<{
    plaidItemId: string;
    accessToken: string;
  }>;

  syncTransactions(input: {
    accessToken: string;
    cursor: string | null;
  }): Promise<SyncPage>;

  verifyWebhook(
    headers: Record<string, string>,
    rawBody: Buffer,
  ): Promise<VerifiedWebhook>;
}
