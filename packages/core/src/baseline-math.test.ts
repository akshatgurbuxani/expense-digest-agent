import { describe, it, expect } from "vitest";
import { Money } from "./money.js";
import { computeBaselineStats } from "./baseline-math.js";

describe("computeBaselineStats", () => {
  it("returns null for an empty input", () => {
    expect(computeBaselineStats([])).toBeNull();
  });

  it("computes mean and median for a single sample", () => {
    const stats = computeBaselineStats([Money.of(1000, "USD")]);
    expect(stats?.sampleCount).toBe(1);
    expect(stats?.mean.minorUnits).toBe(1000);
    expect(stats?.median.minorUnits).toBe(1000);
    expect(stats?.stddevMinorUnits).toBe(0);
  });

  it("computes population stddev in minor units", () => {
    const stats = computeBaselineStats([
      Money.of(100, "USD"),
      Money.of(200, "USD"),
      Money.of(300, "USD"),
    ]);
    expect(stats?.mean.minorUnits).toBe(200);
    expect(stats?.median.minorUnits).toBe(200);
    // variance = ((100-200)^2 + 0 + (300-200)^2)/3 = 6666.67; stddev ≈ 81.65
    expect(stats?.stddevMinorUnits).toBeCloseTo(81.65, 0);
  });

  it("rejects mixed currencies", () => {
    expect(() =>
      computeBaselineStats([Money.of(100, "USD"), Money.of(100, "EUR")]),
    ).toThrow();
  });
});
