import { DateTime } from "luxon";
import type { User, Weekday } from "@expense/core";

/** True when the user's local digest day/time matches `at` (minute precision). */
export function isDueForDigest(user: User, at: Date): boolean {
  const local = DateTime.fromJSDate(at, { zone: "utc" }).setZone(user.timezone);
  const [hourStr, minuteStr] = user.digestTime.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  return (
    local.weekday === weekdayToLuxon(user.digestDay) &&
    local.hour === hour &&
    local.minute === minute
  );
}

function weekdayToLuxon(day: Weekday): number {
  return day === 0 ? 7 : day;
}
