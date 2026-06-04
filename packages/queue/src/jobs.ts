import { ValidationError } from "@expense/core";
import type { JobName, JobPayload } from "@expense/core";
import { z } from "zod";

/** Single source of truth for job payload validation at enqueue and process boundaries. */
export const JOB_SCHEMAS = {
  "txn.sync": z.object({
    userId: z.string().min(1),
    itemId: z.string().min(1),
  }),
  "txn.categorize": z.object({
    userId: z.string().min(1),
    transactionId: z.string().min(1),
  }),
  "anomaly.evaluate": z.object({
    userId: z.string().min(1),
    transactionId: z.string().min(1),
  }),
  "baseline.recompute": z.object({
    userId: z.string().min(1),
  }),
  "digest.generate": z.object({
    userId: z.string().min(1),
    isoWeek: z.string().min(1),
  }),
  "report.generate": z.object({
    userId: z.string().min(1),
    yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  }),
  "delivery.send": z.object({
    userId: z.string().min(1),
    kind: z.enum(["digest", "anomaly", "monthly_report"]),
    refId: z.string().min(1),
  }),
  "mail.sync": z.object({
    userId: z.string().min(1),
    mailAccountId: z.string().min(1),
  }),
  "mail.fullSync": z.object({
    userId: z.string().min(1),
    mailAccountId: z.string().min(1),
  }),
  "mail.watch": z.object({
    userId: z.string().min(1),
    mailAccountId: z.string().min(1),
  }),
  "receipt.parse": z.object({
    userId: z.string().min(1),
    mailMessageId: z.string().min(1),
  }),
  "receipt.match": z
    .object({
      userId: z.string().min(1),
      receiptId: z.string().min(1).optional(),
      transactionId: z.string().min(1).optional(),
    })
    .refine((p) => p.receiptId !== undefined || p.transactionId !== undefined, {
      message: "receipt.match requires receiptId and/or transactionId",
    }),
} as const satisfies Record<JobName, z.ZodType>;

export const JOB_NAMES = Object.keys(JOB_SCHEMAS) as JobName[];

/** Validate a raw payload at a queue boundary; throws ValidationError on mismatch. */
export function validateJobPayload<K extends JobName>(
  name: K,
  payload: unknown,
): JobPayload<K> {
  const parsed = JOB_SCHEMAS[name].safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(
      `invalid payload for job ${name}`,
      parsed.error.flatten(),
    );
  }
  return parsed.data as JobPayload<K>;
}
