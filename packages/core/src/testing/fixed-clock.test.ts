import { describe, it, expect } from "vitest";
import { FixedClock } from "./fixed-clock.js";

describe("FixedClock", () => {
  it("returns the instant it was set to", () => {
    const c = new FixedClock(new Date("2026-05-01T00:00:00.000Z"));
    expect(c.now().toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("advances by milliseconds", () => {
    const c = new FixedClock(new Date("2026-05-01T00:00:00.000Z"));
    c.advance(1500);
    expect(c.now().toISOString()).toBe("2026-05-01T00:00:01.500Z");
  });

  it("can be set to a new instant", () => {
    const c = new FixedClock();
    c.set(new Date("2027-12-31T23:59:59.000Z"));
    expect(c.now().toISOString()).toBe("2027-12-31T23:59:59.000Z");
  });

  it("does not leak internal mutability through now()", () => {
    const c = new FixedClock(new Date("2026-05-01T00:00:00.000Z"));
    c.now().setFullYear(1999);
    expect(c.now().getUTCFullYear()).toBe(2026);
  });
});
