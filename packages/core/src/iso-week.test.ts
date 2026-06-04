import { describe, it, expect } from "vitest";
import { digestJobId, isoWeekLabel } from "./iso-week.js";
import { newId } from "./ids.js";

describe("isoWeekLabel", () => {
  it("formats the ISO week in the user's timezone", () => {
    const at = new Date("2026-05-24T08:00:00.000Z");
    expect(isoWeekLabel("UTC", at)).toBe("2026-W21");
  });

  it("uses local calendar boundaries for non-UTC zones", () => {
    // Sunday evening UTC is still Sunday in America/Denver (MDT, UTC-6)
    const at = new Date("2026-05-25T05:00:00.000Z");
    expect(isoWeekLabel("America/Denver", at)).toBe("2026-W21");
  });
});

describe("digestJobId", () => {
  it("builds the deterministic digest job id", () => {
    const userId = newId<"UserId">();
    expect(digestJobId(userId, "2026-W21")).toBe(
      `digest:${userId}:2026-W21`,
    );
  });
});
