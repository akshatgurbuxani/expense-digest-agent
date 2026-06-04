import type {
  BankProvider,
  SyncPage,
  VerifiedWebhook,
} from "../ports/bank-provider.js";
import type { UserId } from "../ids.js";

export interface FakeBankOptions {
  readonly syncPages?: SyncPage[];
  readonly webhook?: VerifiedWebhook;
}

/** Scriptable BankProvider for tests. */
export function makeFakeBank(opts: FakeBankOptions = {}): BankProvider {
  let pageIndex = 0;
  const pages = opts.syncPages ?? [];

  return {
    async createLinkToken(_userId: UserId) {
      return {
        linkToken: "link-test-token",
        expiration: new Date(Date.now() + 3600_000),
      };
    },

    async exchangePublicToken(_publicToken: string) {
      return { plaidItemId: "item_test", accessToken: "access-test-token" };
    },

    async syncTransactions(_input) {
      const page = pages[pageIndex];
      if (!page) {
        return {
          added: [],
          modified: [],
          removed: [],
          nextCursor: "cursor-end",
          hasMore: false,
        };
      }
      pageIndex += 1;
      return page;
    },

    async verifyWebhook(_headers, _rawBody) {
      return (
        opts.webhook ?? {
          itemId: "item_test",
          type: "TRANSACTIONS",
          code: "SYNC_UPDATES_AVAILABLE",
        }
      );
    },
  };
}

/** Reset a fake bank's page cursor between tests. */
export function resetFakeBank(bank: BankProvider & { _reset?: () => void }): void {
  bank._reset?.();
}
