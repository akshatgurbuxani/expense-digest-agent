import { DateTime } from "luxon";
import type { UserId } from "./ids.js";

/** ISO week label for idempotency, e.g. `2026-W21`. */
export function isoWeekLabel(timezone: string, at: Date): string {
  const local = DateTime.fromJSDate(at, { zone: "utc" }).setZone(timezone);
  const week = String(local.weekNumber).padStart(2, "0");
  return `${local.weekYear}-W${week}`;
}

/** Deterministic BullMQ job id — one digest per user per ISO week. */
export function digestJobId(userId: UserId, isoWeek: string): string {
  return `digest:${userId}:${isoWeek}`;
}

/** UTC date label for daily mail.watch idempotency. */
export function utcDateLabel(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** One watch renewal job per mail account per UTC day. */
export function mailWatchJobId(
  mailAccountId: import("./ids.js").MailAccountId,
  at: Date,
): string {
  return `mail.watch:${mailAccountId}:${utcDateLabel(at)}`;
}

/** One monthly report per user per calendar month. */
export function reportJobId(userId: UserId, yearMonth: string): string {
  return `report:${userId}:${yearMonth}`;
}
