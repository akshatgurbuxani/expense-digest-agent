import { z } from "zod";

const TransactionFixture = z.object({
  amount: z.number().int().positive(),
  merchantName: z.string(),
  merchantNameRaw: z.string().optional(),
  category: z.string().optional(),
  isSubscription: z.boolean().optional(),
  isRecurring: z.boolean().optional(),
  occurredAt: z.string(),
  plaidPfc: z.string().optional(),
  plaidTransactionId: z.string().optional(),
  plaidAccountId: z.string().optional(),
});

const SyncPageFixture = z.object({
  added: z.array(TransactionFixture),
  modified: z.array(TransactionFixture).optional(),
  removed: z.array(z.string()).optional(),
});

const GmailMessageFixture = z.object({
  gmailMessageId: z.string(),
  threadId: z.string(),
  receivedAt: z.string(),
  fromAddress: z.string(),
  subject: z.string(),
  snippet: z.string().nullable().optional(),
  textPlain: z.string().nullable().optional(),
  textHtml: z.string().nullable().optional(),
});

const ExplicitUser = z.object({
  email: z.string().optional(),
  timezone: z.string().optional(),
  digestDay: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]).optional(),
  deliveryPreference: z.enum(["email", "sms"]).optional(),
  plaidItemId: z.string(),
  plaidAccountId: z.string(),
  gmailAddress: z.string().optional(),
  existingTransactions: z.array(TransactionFixture).optional(),
  syncPages: z.array(SyncPageFixture).optional(),
  mailMessages: z.array(GmailMessageFixture).optional(),
});

const PatternDistribution = z.union([
  z.string(),
  z.record(z.number()),
]);

const GenerativeUsers = z.object({
  count: z.number().int().positive(),
  patterns: z.array(PatternDistribution).optional(),
  weeksOfHistory: z.number().int().positive().optional(),
  transactionsPerWeek: z.object({
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  }).optional(),
});

const ExpectedOutcome = z.object({
  digestGenerated: z.boolean().optional(),
  digestContains: z.array(z.string()).optional(),
  anomaliesDetected: z.number().int().min(0).optional(),
  anomalyReasons: z.array(z.string()).optional(),
  deliverySent: z.boolean().optional(),
  deliveryChannel: z.enum(["email", "sms"]).optional(),
  deliveryContains: z.array(z.string()).optional(),
  jobsEnqueued: z.array(z.string()).optional(),
  finalDigestCount: z.number().int().min(0).optional(),
});

export const E2EScenarioSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  users: z.union([z.array(ExplicitUser), GenerativeUsers]),
  expected: ExpectedOutcome.optional(),
  performance: z.object({
    maxDurationMs: z.number().int().positive().optional(),
    maxJobsEnqueued: z.number().int().positive().optional(),
  }).optional(),
});

export type E2EScenario = z.infer<typeof E2EScenarioSchema>;
export type ExplicitUser = z.infer<typeof ExplicitUser>;
export type TransactionFixture = z.infer<typeof TransactionFixture>;
export type GmailMessageFixture = z.infer<typeof GmailMessageFixture>;
export type SpendingPattern = "frugal" | "moderate" | "high" | "subscription-heavy";
