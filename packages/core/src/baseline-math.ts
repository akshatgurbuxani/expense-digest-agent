import { Money } from "./money.js";
import { InvariantError } from "./errors.js";

export interface BaselineStats {
  readonly mean: Money;
  readonly median: Money;
  readonly stddevMinorUnits: number;
  readonly sampleCount: number;
}

/** Pure rolling statistics over a list of amounts (same currency). */
export function computeBaselineStats(
  amounts: Money[],
): BaselineStats | null {
  if (amounts.length === 0) return null;

  const currency = amounts[0]!.currency;
  for (const a of amounts) {
    if (a.currency !== currency) {
      throw new InvariantError(
        `baseline stats require one currency, got ${currency} and ${a.currency}`,
      );
    }
  }

  const values = amounts.map((a) => a.minorUnits).sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const meanMinor = Math.round(sum / values.length);

  const mid = Math.floor(values.length / 2);
  const medianMinor =
    values.length % 2 === 0
      ? Math.round((values[mid - 1]! + values[mid]!) / 2)
      : values[mid]!;

  const variance =
    values.reduce((acc, v) => acc + (v - meanMinor) ** 2, 0) / values.length;
  const stddevMinorUnits = Math.sqrt(variance);

  return {
    mean: Money.of(meanMinor, currency),
    median: Money.of(medianMinor, currency),
    stddevMinorUnits,
    sampleCount: values.length,
  };
}

/** Median of minor-unit values (for merchant recurring baselines). */
export function medianMinorUnits(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}
