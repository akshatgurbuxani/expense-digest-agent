import { NotFoundError, weekWindowFor } from "@expense/core";
import type { McpToolDeps } from "./types.js";
import { defaultCurrency, sumTransactions, totalsByCategory } from "./spending-helpers.js";

export async function getSpendingThisWeek(deps: McpToolDeps) {
  const user = await deps.repos.users.findById(deps.userId);
  if (!user) throw new NotFoundError(`user ${deps.userId}`);

  const window = weekWindowFor(user.timezone, deps.clock.now());
  const txns = await deps.repos.transactions.listInWindow(
    deps.userId,
    window.start,
    window.end,
  );
  const currency = defaultCurrency(txns);
  const total = sumTransactions(txns, currency);

  return {
    window: { start: window.startLabel, end: window.endLabel },
    total: total.toDisplayString(),
    byCategory: totalsByCategory(txns, currency),
  };
}
