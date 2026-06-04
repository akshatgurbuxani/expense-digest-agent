import { describe, it, expect } from "vitest";
import { Money } from "./money.js";
import { InvariantError } from "./errors.js";

describe("Money", () => {
  it("parses a decimal string into exact integer minor units", () => {
    const m = Money.fromDecimalString("10.99", "USD");
    expect(m.minorUnits).toBe(1099);
    expect(m.currency).toBe("USD");
  });

  it("parses whole numbers and single-decimal strings", () => {
    expect(Money.fromDecimalString("5", "USD").minorUnits).toBe(500);
    expect(Money.fromDecimalString("5.5", "USD").minorUnits).toBe(550);
  });

  it("parses negative amounts (refunds)", () => {
    expect(Money.fromDecimalString("-12.34", "USD").minorUnits).toBe(-1234);
  });

  it("does not suffer floating point error when adding", () => {
    const a = Money.fromDecimalString("0.10", "USD");
    const b = Money.fromDecimalString("0.20", "USD");
    expect(a.add(b).toDecimalString()).toBe("0.30");
  });

  it("subtracts", () => {
    const a = Money.of(1099, "USD");
    const b = Money.of(100, "USD");
    expect(a.subtract(b).minorUnits).toBe(999);
  });

  it("formats minor units back to a decimal string with padding", () => {
    expect(Money.of(5, "USD").toDecimalString()).toBe("0.05");
    expect(Money.of(1000, "USD").toDecimalString()).toBe("10.00");
    expect(Money.of(-1234, "USD").toDecimalString()).toBe("-12.34");
  });

  it("computes a ratio against a baseline (for 'up 30%')", () => {
    const now = Money.of(1300, "USD");
    const baseline = Money.of(1000, "USD");
    expect(now.ratioTo(baseline)).toBeCloseTo(1.3);
  });

  it("returns 0 ratio against a zero baseline instead of dividing by zero", () => {
    expect(Money.of(1300, "USD").ratioTo(Money.of(0, "USD"))).toBe(0);
  });

  it("formats display strings with grouping separators", () => {
    expect(Money.of(120455, "USD").toDisplayString()).toBe("$1,204.55");
  });

  it("rejects a non-integer amount", () => {
    expect(() => Money.of(10.5, "USD")).toThrow(InvariantError);
  });

  it("rejects a malformed decimal string", () => {
    expect(() => Money.fromDecimalString("abc", "USD")).toThrow(InvariantError);
  });

  it("rejects mixing currencies in arithmetic", () => {
    const usd = Money.of(100, "USD");
    const eur = Money.of(100, "EUR");
    expect(() => usd.add(eur)).toThrow(InvariantError);
  });
});
