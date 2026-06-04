import type { JobName } from "@expense/core";
import { ValidationError } from "@expense/core";
import { z } from "zod";

const JOB_NAMES = [
  "txn.sync",
  "txn.categorize",
  "anomaly.evaluate",
  "baseline.recompute",
  "digest.generate",
  "delivery.send",
  "mail.sync",
  "mail.fullSync",
  "mail.watch",
  "receipt.parse",
  "receipt.match",
  "report.generate",
] as const satisfies readonly JobName[];

const MatchWeightsSchema = z
  .object({
    exactAmount: z.number().int().nonnegative(),
    nearAmount: z.number().int().nonnegative(),
    sameDay: z.number().int().nonnegative(),
    nearDay: z.number().int().nonnegative(),
    merchantFuzzy: z.number().int().nonnegative(),
    orderIdInMemo: z.number().int().nonnegative(),
    categoryBonus: z.number().int().nonnegative(),
  })
  .strict();

/** Every job queue must declare concurrency — no implicit defaults. */
const WorkerConcurrencySchema = z
  .object({
    "txn.sync": z.number().int().positive(),
    "txn.categorize": z.number().int().positive(),
    "anomaly.evaluate": z.number().int().positive(),
    "baseline.recompute": z.number().int().positive(),
    "digest.generate": z.number().int().positive(),
    "delivery.send": z.number().int().positive(),
    "mail.sync": z.number().int().positive(),
    "mail.fullSync": z.number().int().positive(),
    "mail.watch": z.number().int().positive(),
    "receipt.parse": z.number().int().positive(),
    "receipt.match": z.number().int().positive(),
    "report.generate": z.number().int().positive(),
  })
  .strict();

/** Strict schema — all keys required after YAML merge. No .default() anywhere. */
export const AppConfigSchema = z
  .object({
    queue: z.object({
      prefix: z.string().min(1),
      maxAttempts: z.number().int().positive(),
      backoff: z.object({
        type: z.enum(["exponential", "fixed"]),
        delayMs: z.number().int().nonnegative(),
      }),
    }),
    workers: z.object({
      concurrency: WorkerConcurrencySchema,
    }),
    scheduler: z.object({
      tickIntervalMs: z.number().int().positive(),
    }),
    llm: z.object({
      maxConcurrency: z.number().int().positive(),
    }),
    anomaly: z.object({
      priceIncreaseFactor: z.number().positive(),
      duplicateWindowMs: z.number().int().positive(),
      unusualSigma: z.number().positive(),
      minBaselineSamples: z.number().int().positive(),
      merchantHistoryDays: z.number().int().positive(),
    }),
    digest: z.object({
      minBaselineSamples: z.number().int().positive(),
      flatThreshold: z.number().positive().max(1),
    }),
    mail: z
      .object({
        inboxLabelIds: z.array(z.string().min(1)),
        labelFilterBehavior: z.enum(["INCLUDE", "EXCLUDE"]),
        fullSyncBackfillDays: z.number().int().positive(),
        fullSyncQuery: z.string().min(1),
        classifier: z.object({
          minConfidence: z.number().min(0).max(1),
          llmFallback: z.boolean(),
          blockBankCardAlerts: z.boolean(),
        }),
        match: z.object({
          windowDays: z.number().int().positive(),
          amountToleranceMinorUnits: z.number().int().nonnegative(),
          minScore: z.number().int().positive(),
          weights: MatchWeightsSchema,
        }),
        categoriesTriggerMatch: z.array(z.string().min(1)),
      })
      .strict(),
    report: z
      .object({
        monthlyDay: z.number().int().min(1).max(28),
        deliveryHour: z.number().int().min(0).max(23),
      })
      .strict(),
  })
  .strict();

export type AppConfig = z.infer<typeof AppConfigSchema>;

export type AnomalyConfig = AppConfig["anomaly"];
export type DigestConfig = AppConfig["digest"];
export type MailConfig = AppConfig["mail"];
export type QueueConfig = AppConfig["queue"];
export type WorkerConfig = AppConfig["workers"];

export const JOB_NAME_LIST: readonly JobName[] = JOB_NAMES;

/** Validate merged YAML — throws ValidationError if any required key is missing. */
export function parseAppConfig(raw: unknown): AppConfig {
  const parsed = AppConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      "invalid application configuration",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
}
