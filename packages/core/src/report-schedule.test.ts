import { describe, it, expect } from "vitest";
import { aUser } from "./testing/builders.js";
import { isDueForMonthlyReport, previousYearMonth } from "./report-schedule.js";

describe("report schedule", () => {
  it("matches the configured day and hour in the user timezone", () => {
    const user = aUser({ timezone: "UTC" });
    const dueAt = new Date("2026-06-01T09:00:00.000Z");
    const notDueAt = new Date("2026-06-01T10:00:00.000Z");

    expect(
      isDueForMonthlyReport(user, dueAt, { monthlyDay: 1, deliveryHour: 9 }),
    ).toBe(true);
    expect(
      isDueForMonthlyReport(user, notDueAt, { monthlyDay: 1, deliveryHour: 9 }),
    ).toBe(false);
  });

  it("uses the previous calendar month for June 1 enqueue", () => {
    expect(
      previousYearMonth("UTC", new Date("2026-06-01T09:00:00.000Z")),
    ).toBe("2026-05");
  });
});
