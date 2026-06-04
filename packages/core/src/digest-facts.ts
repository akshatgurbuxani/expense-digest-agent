import { Money, type CurrencyCode } from "./money.js";
import type { Transaction } from "./domain/transaction.js";
import type { SpendBaseline } from "./domain/baseline.js";
import type { DigestFacts, TrendFact } from "./domain/digest-facts.js";
import type { AnomalyReason } from "./domain/anomaly.js";
import type { Category } from "./domain/category.js";
import {
  buildReceiptEnrichmentFacts,
  type ReceiptEnrichmentConfig,
  type ReceiptEnrichmentInput,
} from "./receipt-enrichment-facts.js";

export interface DigestFactsConfig {
  readonly minBaselineSamples: number;
  readonly flatThreshold: number;
}

export interface BuildDigestFactsInput {
  readonly firstName: string | null;
  readonly currency: CurrencyCode;
  readonly window: { readonly startLabel: string; readonly endLabel: string };
  readonly transactions: readonly Transaction[];
  readonly baselines: readonly SpendBaseline[];
  readonly anomalies: ReadonlyArray<{
    readonly reason: AnomalyReason;
    readonly detail: string;
    readonly amount: Money;
  }>;
  readonly receiptEnrichment?: {
    readonly input: ReceiptEnrichmentInput;
    readonly config: ReceiptEnrichmentConfig;
  };
}

/** Pure: transactions + baselines → the deterministic DigestFacts struct. */
export function buildDigestFacts(
  input: BuildDigestFactsInput,
  config: DigestFactsConfig,
): DigestFacts {
  const active = input.transactions.filter(
    (t) => t.category !== null && t.removedAt === null,
  );

  const byCategory = new Map<Category, Money>();
  for (const t of active) {
    const cat = t.category!;
    const prev = byCategory.get(cat) ?? Money.of(0, input.currency);
    byCategory.set(cat, prev.add(t.amount));
  }

  let total = Money.of(0, input.currency);
  for (const amount of byCategory.values()) {
    total = total.add(amount);
  }

  const baselineByCategory = new Map(
    input.baselines.map((b) => [b.category, b] as const),
  );
  const mature = isMature(input.baselines, config.minBaselineSamples);

  const categories = [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, amount]) => {
      const share =
        total.minorUnits === 0
          ? "0%"
          : `${Math.round((amount.minorUnits / total.minorUnits) * 100)}%`;
      const base = baselineByCategory.get(category);
      const vsBaseline =
        mature && base && base.sampleCount >= config.minBaselineSamples
          ? trendFact(amount, base.mean, config.flatThreshold)
          : null;
      return {
        category,
        amount: amount.toDisplayString(),
        share,
        vsBaseline,
      };
    });

  let totalSpendVsBaseline: TrendFact | null = null;
  if (mature) {
    let baselineTotal = Money.of(0, input.currency);
    for (const b of input.baselines) {
      if (b.sampleCount >= config.minBaselineSamples) {
        baselineTotal = baselineTotal.add(b.mean);
      }
    }
    if (baselineTotal.minorUnits > 0) {
      totalSpendVsBaseline = trendFact(
        total,
        baselineTotal,
        config.flatThreshold,
      );
    }
  }

  return {
    user: { firstName: input.firstName, currency: input.currency },
    window: input.window,
    totalSpend: total.toDisplayString(),
    totalSpendVsBaseline,
    categories,
    anomalies: input.anomalies.map((a) => ({
      reason: a.reason,
      detail: a.detail,
      amount: a.amount.toDisplayString(),
    })),
    ...(input.receiptEnrichment
      ? buildReceiptEnrichmentFacts(
          input.receiptEnrichment.input,
          input.receiptEnrichment.config,
        )
      : {
          matchedReceipts: [],
          unmatchedReceipts: [],
          chargesMissingReceipts: [],
        }),
    maturity: mature ? "established" : "learning",
  };
}

function isMature(
  baselines: readonly SpendBaseline[],
  minBaselineSamples: number,
): boolean {
  return baselines.some((b) => b.sampleCount >= minBaselineSamples);
}

function trendFact(
  current: Money,
  baseline: Money,
  flatThreshold: number,
): TrendFact {
  const ratio = current.ratioTo(baseline);
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  const direction =
    ratio > 1 + flatThreshold
      ? "up"
      : ratio < 1 - flatThreshold
        ? "down"
        : "flat";
  return {
    direction,
    percent: `${pct}%`,
    baselineAmount: baseline.toDisplayString(),
  };
}
