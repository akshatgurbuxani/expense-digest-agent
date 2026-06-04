import { NotFoundError } from "../errors.js";
import { newId } from "../ids.js";
import type { ItemId, UserId } from "../ids.js";
import type { BankProvider } from "../ports/bank-provider.js";
import type { Clock } from "../ports/clock.js";
import type { JobProducer } from "../ports/jobs.js";
import type { Logger } from "../ports/logger.js";
import type {
  AccountRepository,
  ItemRepository,
  TransactionRepository,
} from "../ports/repositories.js";
import type { RawTransaction } from "../ports/bank-provider.js";
import type { Account } from "../domain/account.js";
import type { Transaction } from "../domain/transaction.js";

export interface SyncDeps {
  items: ItemRepository;
  accounts: AccountRepository;
  transactions: TransactionRepository;
  bank: BankProvider;
  queue: JobProducer;
  clock: Clock;
  log?: Logger;  // Optional for backward compat with existing tests
}

export function makeSyncService(deps: SyncDeps) {
  return {
    async run(payload: { userId: UserId; itemId: ItemId }): Promise<void> {
      const log = deps.log?.child({ userId: payload.userId, itemId: payload.itemId });
      
      const item = await deps.items.findById(payload.itemId);
      if (!item || item.userId !== payload.userId) {
        log?.error("item not found or userId mismatch");
        throw new NotFoundError(`item ${payload.itemId}`);
      }

      log?.info("sync started", { cursor: item.syncCursor });

      await deps.items.withAccessToken(item.id, async (token) => {
        let cursor = item.syncCursor;
        let hasMore = true;
        let pageCount = 0;
        let totalAdded = 0;
        let totalModified = 0;
        let totalRemoved = 0;

        while (hasMore) {
          pageCount += 1;
          const page = await deps.bank.syncTransactions({
            accessToken: token,
            cursor,
          });

          log?.debug("sync page received", {
            pageNumber: pageCount,
            added: page.added.length,
            modified: page.modified.length,
            removed: page.removed.length,
            cursor: page.nextCursor,
            hasMore: page.hasMore,
          });

          const toUpsert: Transaction[] = [];
          for (const raw of [...page.added, ...page.modified]) {
            const account = await deps.accounts.findByPlaidAccountId(
              payload.userId,
              raw.plaidAccountId,
            );
            if (!account) {
              log?.warn("account not found for transaction", {
                plaidAccountId: raw.plaidAccountId,
                plaidTransactionId: raw.plaidTransactionId,
              });
              continue;
            }
            toUpsert.push(mapRaw(raw, account, payload.userId));
          }

          const { insertedIds } = await deps.transactions.upsertMany(
            payload.userId,
            toUpsert,
          );

          totalAdded += page.added.length;
          totalModified += page.modified.length;

          if (page.removed.length > 0) {
            await deps.transactions.softDeleteByPlaidIds(
              payload.userId,
              page.removed,
              deps.clock.now(),
            );
            totalRemoved += page.removed.length;
          }

          log?.debug("enqueuing categorization jobs", { count: insertedIds.length });
          
          for (const id of insertedIds) {
            await deps.queue.enqueue("txn.categorize", {
              userId: payload.userId,
              transactionId: id,
            });
          }

          cursor = page.nextCursor;
          hasMore = page.hasMore;
          await deps.items.saveCursor(item.id, cursor, deps.clock.now());
        }

        log?.info("sync completed", {
          pages: pageCount,
          added: totalAdded,
          modified: totalModified,
          removed: totalRemoved,
          finalCursor: cursor,
        });
      });
    },
  };
}

function mapRaw(
  raw: RawTransaction,
  account: Account,
  userId: UserId,
): Transaction {
  return {
    id: newId<"TransactionId">(),
    accountId: account.id,
    userId,
    plaidTransactionId: raw.plaidTransactionId,
    amount: raw.amount,
    merchantNameRaw: raw.merchantNameRaw,
    merchantName: null,
    category: null,
    plaidPfc: raw.plaidPfc,
    isSubscription: false,
    isRecurring: false,
    occurredAt: raw.occurredAt,
    enrichedAt: null,
    removedAt: null,
  };
}
