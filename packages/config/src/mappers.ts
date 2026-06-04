import type { DigestFactsConfig, AnomalyDetectionConfig } from "@expense/core";
import type { MailClassifierConfig } from "@expense/core";
import type { ReceiptMatchConfig } from "@expense/core";
import type { ReceiptEnrichmentConfig } from "@expense/core";
import { CATEGORIES, type Category } from "@expense/core";
import { InvariantError } from "@expense/core";
import type { JobName } from "@expense/core";
import type { QueueSettings } from "@expense/queue";
import type { AppConfig } from "./app-config.js";

export function toQueueSettings(
  app: AppConfig,
  prefixOverride?: string,
): QueueSettings {
  return {
    prefix: prefixOverride ?? app.queue.prefix,
    maxAttempts: app.queue.maxAttempts,
    backoff: {
      type: app.queue.backoff.type,
      delayMs: app.queue.backoff.delayMs,
    },
    workerConcurrency: app.workers.concurrency as Record<JobName, number>,
  };
}

export function toAnomalyDetectionConfig(
  app: AppConfig,
): AnomalyDetectionConfig {
  return { ...app.anomaly };
}

export function toDigestFactsConfig(app: AppConfig): DigestFactsConfig {
  return { ...app.digest };
}

export function toMailClassifierConfig(app: AppConfig): MailClassifierConfig {
  return {
    blockBankCardAlerts: app.mail.classifier.blockBankCardAlerts,
  };
}

export function toReceiptMatchConfig(app: AppConfig): ReceiptMatchConfig {
  return {
    windowDays: app.mail.match.windowDays,
    amountToleranceMinorUnits: app.mail.match.amountToleranceMinorUnits,
    minScore: app.mail.match.minScore,
    weights: app.mail.match.weights,
    categoryBonusCategories: parseCategories(app.mail.categoriesTriggerMatch),
  };
}

export function toReceiptEnrichmentConfig(app: AppConfig): ReceiptEnrichmentConfig {
  return {
    matchConfig: toReceiptMatchConfig(app),
    minParseConfidence: app.mail.classifier.minConfidence,
    categoriesTriggerMatch: toMailCategoriesTriggerMatch(app),
  };
}

export function toReportScheduleConfig(
  app: AppConfig,
): import("@expense/core").ReportScheduleConfig {
  return { ...app.report };
}

export function toMailCategoriesTriggerMatch(
  app: AppConfig,
): readonly Category[] {
  return parseCategories(app.mail.categoriesTriggerMatch);
}

function parseCategories(values: readonly string[]): Category[] {
  return values.map((value) => {
    if (!(CATEGORIES as readonly string[]).includes(value)) {
      throw new InvariantError(`invalid category in mail config: ${value}`);
    }
    return value as Category;
  });
}
