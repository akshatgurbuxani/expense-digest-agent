import type {
  AnomalyId,
  DigestId,
  ItemId,
  MailAccountId,
  MailMessageId,
  ReceiptId,
  ReportId,
  TransactionId,
  UserId,
} from "../ids.js";
import type { Logger } from "./logger.js";

/** Typed job registry — Zod validation lives in `@expense/queue`; shapes live here. */
export type JobName =
  | "txn.sync"
  | "txn.categorize"
  | "anomaly.evaluate"
  | "baseline.recompute"
  | "digest.generate"
  | "report.generate"
  | "delivery.send"
  | "mail.sync"
  | "mail.fullSync"
  | "mail.watch"
  | "receipt.parse"
  | "receipt.match";

export interface JobPayloads {
  "txn.sync": { userId: UserId; itemId: ItemId };
  "txn.categorize": { userId: UserId; transactionId: TransactionId };
  "anomaly.evaluate": { userId: UserId; transactionId: TransactionId };
  "baseline.recompute": { userId: UserId };
  "digest.generate": { userId: UserId; isoWeek: string };
  "report.generate": { userId: UserId; yearMonth: string };
  "delivery.send": {
    userId: UserId;
    kind: "digest" | "anomaly" | "monthly_report";
    refId: DigestId | AnomalyId | ReportId;
  };
  "mail.sync": { userId: UserId; mailAccountId: MailAccountId };
  "mail.fullSync": { userId: UserId; mailAccountId: MailAccountId };
  "mail.watch": { userId: UserId; mailAccountId: MailAccountId };
  "receipt.parse": { userId: UserId; mailMessageId: MailMessageId };
  "receipt.match": {
    userId: UserId;
    receiptId?: ReceiptId;
    transactionId?: TransactionId;
  };
}

export type JobPayload<K extends JobName> = JobPayloads[K];

export interface EnqueueOptions {
  jobId?: string;
  delayMs?: number;
}

export interface JobContext {
  readonly jobId: string;
  readonly attempt: number;
  readonly log: Logger;
}

export type JobHandler<K extends JobName> = (
  payload: JobPayload<K>,
  ctx: JobContext,
) => Promise<void>;

export interface JobProducer {
  enqueue<K extends JobName>(
    name: K,
    payload: JobPayload<K>,
    opts?: EnqueueOptions,
  ): Promise<void>;
}

export interface JobConsumer {
  process<K extends JobName>(name: K, handler: JobHandler<K>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
