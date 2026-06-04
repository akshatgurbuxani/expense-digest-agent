import type { Clock } from "../ports/clock.js";
import type { Logger } from "../ports/logger.js";
import type { UserId } from "../ids.js";
import type {
  BaselineRepository,
  TransactionRepository,
} from "../ports/repositories.js";
import { computeBaselineStats } from "../baseline-math.js";
import type { Category } from "../domain/category.js";
import { CATEGORIES } from "../domain/category.js";
import type { SpendBaseline } from "../domain/baseline.js";

export interface BaselineDeps {
  transactions: TransactionRepository;
  baselines: BaselineRepository;
  clock: Clock;
  log?: Logger;
}

export function makeBaselineService(deps: BaselineDeps) {
  return {
    async run(payload: { userId: UserId }): Promise<void> {
      const log = deps.log?.child({ userId: payload.userId });
      
      const txns = await deps.transactions.listForUser(payload.userId);
      const enriched = txns.filter((t) => t.category !== null);

      log?.info("recomputing baselines", {
        totalTransactions: txns.length,
        enrichedTransactions: enriched.length,
      });

      const byCategory = new Map<Category, typeof enriched>();
      for (const cat of CATEGORIES) byCategory.set(cat, []);
      for (const t of enriched) {
        byCategory.get(t.category!)!.push(t);
      }

      const rows: SpendBaseline[] = [];
      const computedAt = deps.clock.now();

      for (const [category, list] of byCategory) {
        if (list.length === 0) continue;
        const stats = computeBaselineStats(list.map((t) => t.amount));
        if (!stats) continue;
        rows.push({
          userId: payload.userId,
          category,
          period: "weekly",
          mean: stats.mean,
          median: stats.median,
          stddevMinorUnits: stats.stddevMinorUnits,
          sampleCount: stats.sampleCount,
          computedAt,
        });
      }

      log?.info("baselines computed", {
        categoriesWithBaselines: rows.length,
        categories: rows.map(r => `${r.category}:${r.sampleCount}`),
      });

      if (rows.length > 0) {
        await deps.baselines.upsertMany(payload.userId, rows);
      }
    },
  };
}
