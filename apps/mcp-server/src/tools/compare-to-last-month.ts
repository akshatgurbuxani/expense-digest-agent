import { DateTime } from "luxon";
import { NotFoundError } from "@expense/core";
import type { McpToolDeps } from "./types.js";
import { defaultCurrency, sumTransactions } from "./spending-helpers.js";

export async function compareToLastMonth(deps: McpToolDeps) {
  const user = await deps.repos.users.findById(deps.userId);
  if (!user) throw new NotFoundError(`user ${deps.userId}`);

  const now = DateTime.fromJSDate(deps.clock.now(), { zone: "utc" }).setZone(
    user.timezone,
  );
  const thisMonthStart = now.startOf("month");
  const lastMonthStart = thisMonthStart.minus({ months: 1 });

  const thisMonthTxns = await deps.repos.transactions.listInWindow(
    deps.userId,
    thisMonthStart.toUTC().toJSDate(),
    now.toUTC().toJSDate(),
  );
  const lastMonthTxns = await deps.repos.transactions.listInWindow(
    deps.userId,
    lastMonthStart.toUTC().toJSDate(),
    thisMonthStart.toUTC().toJSDate(),
  );

  const currency = defaultCurrency([...thisMonthTxns, ...lastMonthTxns]);
  const thisMonth = sumTransactions(thisMonthTxns, currency);
  const lastMonth = sumTransactions(lastMonthTxns, currency);

  const delta =
    lastMonth.minorUnits === 0
      ? null
      : `${Math.round((thisMonth.ratioTo(lastMonth) - 1) * 100)}%`;

  return {
    thisMonth: {
      label: thisMonthStart.toFormat("MMMM yyyy"),
      total: thisMonth.toDisplayString(),
    },
    lastMonth: {
      label: lastMonthStart.toFormat("MMMM yyyy"),
      total: lastMonth.toDisplayString(),
    },
    changeVsLastMonth: delta,
  };
}
