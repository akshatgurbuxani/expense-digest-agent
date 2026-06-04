import { describe, it, expect } from "vitest";
import { makeSystemClock } from "./clock.js";

describe("makeSystemClock", () => {
  it("returns a Date close to real now", () => {
    const before = Date.now();
    const now = makeSystemClock().now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});
