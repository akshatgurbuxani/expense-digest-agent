import { NotFoundError, weekWindowFor } from "@expense/core";
import type { Category } from "@expense/core";
import type { McpToolDeps } from "./types.js";
import { defaultCurrency, sumTransactions } from "./spending-helpers.js";

export async function getSpendingByCategory(
  deps: McpToolDeps,
  category: Category,
) {
  const user = await deps.repos.users.findById(deps.userId);
  if (!user) throw new NotFoundError(`user ${deps.userId}`);

  const window = weekWindowFor(user.timezone, deps.clock.now());
  const txns = await deps.repos.transactions.listInWindow(
    deps.userId,
    window.start,
    window.end,
  );
  const filtered = txns.filter(
    (t) => t.category === category && t.removedAt === null,
  );
  const currency = defaultCurrency(txns);
  const total = sumTransactions(filtered, currency);

  return {
    category,
    window: { start: window.startLabel, end: window.endLabel },
    total: total.toDisplayString(),
    transactionCount: filtered.length,
  };
}
