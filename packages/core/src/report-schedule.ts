import { DateTime } from "luxon";
import type { User } from "./domain/user.js";

export interface ReportScheduleConfig {
  readonly monthlyDay: number;
  readonly deliveryHour: number;
}

/** True when the user's local calendar day/hour matches the monthly report schedule. */
export function isDueForMonthlyReport(
  user: User,
  at: Date,
  config: ReportScheduleConfig,
): boolean {
  const local = DateTime.fromJSDate(at, { zone: "utc" }).setZone(user.timezone);
  return (
    local.day === config.monthlyDay &&
    local.hour === config.deliveryHour &&
    local.minute === 0
  );
}

/** Previous calendar month label for reports enqueued on the 1st, e.g. `2026-05`. */
export function previousYearMonth(timezone: string, at: Date): string {
  return DateTime.fromJSDate(at, { zone: "utc" })
    .setZone(timezone)
    .minus({ months: 1 })
    .toFormat("yyyy-MM");
}
