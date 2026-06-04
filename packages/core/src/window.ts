import { DateTime } from "luxon";

export interface WeekWindow {
  readonly start: Date;
  readonly end: Date;
  readonly startLabel: string;
  readonly endLabel: string;
}

const LABEL_FMT = { month: "short", day: "numeric" } as const;

/**
 * Rolling N-day spend window ending at `at`. Boundaries are UTC instants;
 * labels are rendered in the user's IANA timezone (DST-safe via Luxon).
 */
export function weekWindowFor(
  timezone: string,
  at: Date,
  days = 7,
): WeekWindow {
  const end = DateTime.fromJSDate(at, { zone: "utc" });
  const start = end.minus({ days });

  const startLocal = start.setZone(timezone);
  const endLocal = end.setZone(timezone);

  return {
    start: start.toJSDate(),
    end: end.toJSDate(),
    startLabel: startLocal.toLocaleString(LABEL_FMT),
    endLabel: endLocal.toLocaleString(LABEL_FMT),
  };
}

/** True when `d` falls in [window.start, window.end). */
export function isInWeekWindow(d: Date, window: WeekWindow): boolean {
  const t = d.getTime();
  return t >= window.start.getTime() && t < window.end.getTime();
}

export interface MonthWindow {
  readonly start: Date;
  readonly end: Date;
  readonly monthLabel: string;
  readonly yearMonth: string;
}

/** Calendar month in the user's timezone — [start, end) UTC instants. */
export function monthWindowFor(timezone: string, at: Date): MonthWindow {
  const local = DateTime.fromJSDate(at, { zone: timezone });
  const start = local.startOf("month");
  const end = start.plus({ months: 1 });

  return {
    start: start.toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
    monthLabel: start.toFormat("MMMM yyyy"),
    yearMonth: start.toFormat("yyyy-MM"),
  };
}

/** Month window from a `YYYY-MM` label in the user's timezone. */
export function monthWindowFromYearMonth(
  timezone: string,
  yearMonth: string,
): MonthWindow {
  const [yearStr, monthStr] = yearMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const start = DateTime.fromObject({ year, month, day: 1 }, { zone: timezone });
  const end = start.plus({ months: 1 });
  return {
    start: start.toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
    monthLabel: start.toFormat("MMMM yyyy"),
    yearMonth: start.toFormat("yyyy-MM"),
  };
}
