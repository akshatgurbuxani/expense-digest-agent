import { NotFoundError } from "../errors.js";
import type { Category } from "../domain/category.js";
import type { Clock } from "../ports/clock.js";
import type { JobProducer } from "../ports/jobs.js";
import type { LlmProvider } from "../ports/llm-provider.js";
import type { Logger } from "../ports/logger.js";
import type {
  MerchantCategoryRepository,
  TransactionRepository,
} from "../ports/repositories.js";
import type { TransactionId, UserId } from "../ids.js";
import {
  makeResolverChain,
  resolveCategory,
} from "./category-resolvers.js";

export interface CategorizeDeps {
  transactions: TransactionRepository;
  merchants: MerchantCategoryRepository;
  llm: LlmProvider;
  queue: JobProducer;
  clock: Clock;
  log?: Logger;
  /** When set, categorized txns in these categories enqueue receipt.match. */
  categoriesTriggerMatch?: readonly Category[];
}

export function makeCategorizeService(deps: CategorizeDeps) {
  const chain = makeResolverChain();

  return {
    async run(payload: {
      userId: UserId;
      transactionId: TransactionId;
    }): Promise<void> {
      const log = deps.log?.child({ userId: payload.userId, transactionId: payload.transactionId });
      
      const txn = await deps.transactions.findById(
        payload.userId,
        payload.transactionId,
      );
      if (!txn) {
        log?.error("transaction not found");
        throw new NotFoundError(`transaction ${payload.transactionId}`);
      }

      log?.info("categorizing transaction", {
        merchantNameRaw: txn.merchantNameRaw,
        amount: txn.amount.toDisplayString(),
      });

      const enrichment = await resolveCategory(chain, {
        rawName: txn.merchantNameRaw,
        plaidPfc: txn.plaidPfc,
        amount: txn.amount,
        merchants: deps.merchants,
        llm: deps.llm,
      });

      log?.info("enrichment resolved", {
        merchantName: enrichment.merchantName,
        category: enrichment.category,
        isSubscription: enrichment.signals.isSubscription,
        isRecurring: enrichment.signals.isRecurring,
      });

      const enrichedAt = deps.clock.now();
      await deps.transactions.saveEnrichment(payload.userId, txn.id, {
        merchantName: enrichment.merchantName,
        category: enrichment.category,
        isSubscription: enrichment.signals.isSubscription,
        isRecurring: enrichment.signals.isRecurring,
        enrichedAt,
      });

      log?.debug("enqueuing baseline.recompute");
      await deps.queue.enqueue("baseline.recompute", {
        userId: payload.userId,
      });

      if (
        enrichment.signals.isSubscription ||
        enrichment.signals.isRecurring
      ) {
        log?.debug("enqueuing anomaly.evaluate (subscription/recurring detected)");
        await deps.queue.enqueue("anomaly.evaluate", {
          userId: payload.userId,
          transactionId: txn.id,
        });
      }

      const triggerCategories = deps.categoriesTriggerMatch ?? [];
      if (
        triggerCategories.length > 0 &&
        triggerCategories.includes(enrichment.category)
      ) {
        log?.debug("enqueuing receipt.match (category triggers match)");
        await deps.queue.enqueue("receipt.match", {
          userId: payload.userId,
          transactionId: txn.id,
        });
      }
    },
  };
}
