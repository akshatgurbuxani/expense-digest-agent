import { describe, it, expect } from "vitest";
import { weekWindowFor, isInWeekWindow } from "./window.js";

describe("weekWindowFor", () => {
  it("returns a 7-day window ending at `at`", () => {
    const at = new Date("2026-05-25T15:00:00.000Z");
    const w = weekWindowFor("UTC", at, 7);
    expect(w.end.toISOString()).toBe(at.toISOString());
    expect(w.start.toISOString()).toBe("2026-05-18T15:00:00.000Z");
  });

  it("labels window boundaries in the user's timezone", () => {
    const at = new Date("2026-05-25T20:00:00.000Z"); // May 25 afternoon MDT
    const w = weekWindowFor("America/Denver", at, 7);
    expect(w.startLabel).toMatch(/May 18/);
    expect(w.endLabel).toMatch(/May 25/);
  });

  it("handles a DST spring-forward boundary without shifting the day count", () => {
    // US spring forward 2026-03-08: clocks jump 2am -> 3am in America/New_York
    const at = new Date("2026-03-09T12:00:00.000Z");
    const w = weekWindowFor("America/New_York", at, 7);
    const ms = w.end.getTime() - w.start.getTime();
    expect(ms).toBe(7 * 24 * 60 * 60 * 1000);
    expect(w.endLabel).toMatch(/Mar 9/);
    expect(w.startLabel).toMatch(/Mar 2/);
  });

  it("treats transactions inside [start, end) as in-window", () => {
    const at = new Date("2026-05-25T00:00:00.000Z");
    const w = weekWindowFor("UTC", at);
    const inside = new Date("2026-05-24T23:59:59.000Z");
    const outside = new Date("2026-05-17T23:59:59.000Z");
    expect(isInWeekWindow(inside, w)).toBe(true);
    expect(isInWeekWindow(outside, w)).toBe(false);
    expect(isInWeekWindow(at, w)).toBe(false); // end is exclusive
  });
});
