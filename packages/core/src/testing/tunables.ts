import type { AnomalyDetectionConfig } from "../anomaly-detectors.js";
import type { DigestFactsConfig } from "../digest-facts.js";

/**
 * Test fixtures mirroring `config/default.yaml` — for unit tests only.
 * Runtime values always come from YAML via `@expense/config`.
 */
export const TEST_ANOMALY_CONFIG: AnomalyDetectionConfig = {
  priceIncreaseFactor: 1.5,
  duplicateWindowMs: 86_400_000,
  unusualSigma: 3,
  minBaselineSamples: 4,
  merchantHistoryDays: 90,
};

export const TEST_DIGEST_FACTS_CONFIG: DigestFactsConfig = {
  minBaselineSamples: 4,
  flatThreshold: 0.05,
};

export const TEST_MAIL_CLASSIFIER_CONFIG = {
  blockBankCardAlerts: true,
} as const;

export const TEST_RECEIPT_MATCH_CONFIG = {
  windowDays: 5,
  amountToleranceMinorUnits: 100,
  minScore: 70,
  weights: {
    exactAmount: 40,
    nearAmount: 25,
    sameDay: 25,
    nearDay: 15,
    merchantFuzzy: 20,
    orderIdInMemo: 15,
    categoryBonus: 10,
  },
  categoryBonusCategories: [
    "shopping",
    "subscriptions",
    "dining",
    "travel",
    "entertainment",
  ],
} as const;

export const TEST_MAIL_FULL_SYNC_QUERY =
  "category:updates OR subject:(order OR receipt)" as const;
