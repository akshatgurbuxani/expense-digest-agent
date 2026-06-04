import { InvariantError } from "./errors.js";

export type CurrencyCode = "USD" | "EUR" | "GBP";

/**
 * An amount in minor units (e.g. cents). Immutable. Never a float.
 * Arithmetic only ever happens on `Money`; it becomes a string only at the
 * edge (DigestFacts, templates). See docs/conventions.md §1.
 */
export class Money {
  private constructor(
    readonly minorUnits: number,
    readonly currency: CurrencyCode,
  ) {}

  static of(minorUnits: number, currency: CurrencyCode): Money {
    if (!Number.isInteger(minorUnits)) {
      throw new InvariantError(
        `Money.minorUnits must be an integer, got ${minorUnits}`,
      );
    }
    return new Money(minorUnits, currency);
  }

  /** Parse a decimal string like "10.99" exactly, without float math. */
  static fromDecimalString(value: string, currency: CurrencyCode): Money {
    const trimmed = value.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new InvariantError(`invalid decimal money string: "${value}"`);
    }
    const negative = trimmed.startsWith("-");
    const [whole, frac = ""] = trimmed.replace("-", "").split(".");
    const cents = `${frac}00`.slice(0, 2);
    const minor = Number(whole) * 100 + Number(cents);
    return Money.of(negative ? -minor : minor, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.minorUnits + other.minorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.minorUnits - other.minorUnits, this.currency);
  }

  /** Ratio against another amount, as a plain number (for "up 30%"). */
  ratioTo(baseline: Money): number {
    this.assertSameCurrency(baseline);
    return baseline.minorUnits === 0
      ? 0
      : this.minorUnits / baseline.minorUnits;
  }

  toDecimalString(): string {
    const sign = this.minorUnits < 0 ? "-" : "";
    const abs = Math.abs(this.minorUnits);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  }

  /** Display format for DigestFacts and templates: "$1,204.55" */
  toDisplayString(): string {
    const sign = this.minorUnits < 0 ? "-" : "";
    const abs = Math.abs(this.minorUnits);
    const dollars = Math.floor(abs / 100);
    const cents = String(abs % 100).padStart(2, "0");
    return `${sign}$${dollars.toLocaleString("en-US")}.${cents}`;
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new InvariantError(
        `currency mismatch: ${this.currency} vs ${other.currency}`,
      );
    }
  }
}
