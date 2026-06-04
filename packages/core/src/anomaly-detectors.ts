import { medianMinorUnits } from "./baseline-math.js";
import { Registry } from "./registry.js";
import type { Transaction } from "./domain/transaction.js";
import type { SpendBaseline } from "./domain/baseline.js";
import type { AnomalyReason, AnomalyVerdict } from "./domain/anomaly.js";

/** Tunable thresholds for deterministic anomaly detection — values come from config YAML only. */
export interface AnomalyDetectionConfig {
  readonly priceIncreaseFactor: number;
  readonly duplicateWindowMs: number;
  readonly unusualSigma: number;
  readonly minBaselineSamples: number;
  readonly merchantHistoryDays: number;
}

export interface DetectionContext {
  readonly transaction: Transaction;
  readonly recentSameMerchant: readonly Transaction[];
  readonly merchantHistoryMinorUnits: readonly number[];
  readonly categoryBaseline: SpendBaseline | null;
}

export interface AnomalyDetector {
  readonly reason: AnomalyReason;
  detect(ctx: DetectionContext): AnomalyVerdict | null;
}

export function makePriceIncreaseDetector(
  config: AnomalyDetectionConfig,
): AnomalyDetector {
  return {
    reason: "price_increase",
    detect(ctx) {
      const history = ctx.merchantHistoryMinorUnits;
      if (history.length < 2) return null;
      const median = medianMinorUnits(history);
      if (median === null || median === 0) return null;
      const current = ctx.transaction.amount.minorUnits;
      if (current < median * config.priceIncreaseFactor) return null;
      const display = ctx.transaction.amount.toDisplayString();
      return {
        reason: "price_increase",
        severity: "high",
        detail: `${merchantLabel(ctx.transaction)} charge ${display} is well above the usual ${formatMinor(median)}`,
      };
    },
  };
}

export function makeDuplicateChargeDetector(
  config: AnomalyDetectionConfig,
): AnomalyDetector {
  return {
    reason: "duplicate_charge",
    detect(ctx) {
      const { transaction } = ctx;
      for (const prior of ctx.recentSameMerchant) {
        if (prior.id === transaction.id) continue;
        if (prior.amount.minorUnits !== transaction.amount.minorUnits) continue;
        const delta = Math.abs(
          transaction.occurredAt.getTime() - prior.occurredAt.getTime(),
        );
        if (delta > 0 && delta <= config.duplicateWindowMs) {
          return {
            reason: "duplicate_charge",
            severity: "high",
            detail: `Possible duplicate ${transaction.amount.toDisplayString()} charge at ${merchantLabel(transaction)}`,
          };
        }
      }
      return null;
    },
  };
}

export function makeNewSubscriptionDetector(): AnomalyDetector {
  return {
    reason: "new_subscription",
    detect(ctx) {
      const { transaction } = ctx;
      if (!transaction.isSubscription && !transaction.isRecurring) return null;
      if (ctx.merchantHistoryMinorUnits.length > 0) return null;
      return {
        reason: "new_subscription",
        severity: "low",
        detail: `New recurring charge from ${merchantLabel(transaction)} (${transaction.amount.toDisplayString()})`,
      };
    },
  };
}

export function makeUnusualSpendDetector(
  config: AnomalyDetectionConfig,
): AnomalyDetector {
  return {
    reason: "unusual_spend",
    detect(ctx) {
      const base = ctx.categoryBaseline;
      if (!base || base.sampleCount < config.minBaselineSamples) return null;
      const threshold =
        base.mean.minorUnits + config.unusualSigma * base.stddevMinorUnits;
      if (ctx.transaction.amount.minorUnits <= threshold) return null;
      return {
        reason: "unusual_spend",
        severity: "low",
        detail: `${merchantLabel(ctx.transaction)} spend ${ctx.transaction.amount.toDisplayString()} is unusually high for ${base.category}`,
      };
    },
  };
}

export function makeAnomalyDetectors(
  config: AnomalyDetectionConfig,
): Registry<AnomalyReason, AnomalyDetector> {
  return new Registry<AnomalyReason, AnomalyDetector>()
    .register("price_increase", makePriceIncreaseDetector(config))
    .register("duplicate_charge", makeDuplicateChargeDetector(config))
    .register("new_subscription", makeNewSubscriptionDetector())
    .register("unusual_spend", makeUnusualSpendDetector(config));
}

function merchantLabel(t: Transaction): string {
  return t.merchantName ?? t.merchantNameRaw;
}

function formatMinor(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
