import { describe, it, expect } from "vitest";
import { fullSyncQueryWithBackfill } from "./mail-full-sync-query.js";

describe("fullSyncQueryWithBackfill", () => {
  it("appends Gmail after: filter from backfill days", () => {
    const query = fullSyncQueryWithBackfill(
      "subject:receipt",
      30,
      new Date("2026-05-24T12:00:00.000Z"),
    );
    expect(query).toBe("subject:receipt after:2026/04/24");
  });
});
