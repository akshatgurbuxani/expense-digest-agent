import type { MailAccountId, UserId } from "../ids.js";
import { newId } from "../ids.js";
import type { MailClassifierConfig } from "../mail-classifiers.js";
import type { Clock } from "../ports/clock.js";
import type { MailProvider } from "../ports/mail-provider.js";
import type { ReceiptExtractor } from "../ports/receipt-extractor.js";
import type { ReceiptMatchConfig } from "../receipt-match-scorer.js";
import {
  makeMailFullSyncService,
  makeMailSyncService,
  makeReceiptMatchService,
  makeReceiptParseService,
} from "../services/index.js";
import { FixedClock } from "./fixed-clock.js";
import { makeFakeReceiptExtractor } from "./fake-receipt-extractor.js";
import { makeInMemoryJobQueue } from "./in-memory-queue.js";
import type { TestRepositories } from "./in-memory-repos.js";
import { makeInMemoryRepositories } from "./in-memory-repos.js";
import {
  TEST_MAIL_CLASSIFIER_CONFIG,
  TEST_MAIL_FULL_SYNC_QUERY,
  TEST_RECEIPT_MATCH_CONFIG,
} from "./tunables.js";

/** Default instant for mail pipeline tests — aligns match-window fixtures. */
export const MAIL_PIPELINE_TEST_CLOCK_AT = new Date("2026-05-20T12:00:00.000Z");

export interface MailPipelineHarnessOptions {
  readonly repos?: TestRepositories;
  readonly mail: MailProvider;
  readonly extractor?: ReceiptExtractor;
  readonly clock?: Clock;
  readonly classifierConfig?: MailClassifierConfig;
  readonly matchConfig?: ReceiptMatchConfig;
  readonly fullSyncQuery?: string;
  readonly fullSyncBackfillDays?: number;
}

export interface MailPipelineHarness {
  readonly repos: TestRepositories;
  readonly queue: ReturnType<typeof makeInMemoryJobQueue>;
  readonly clock: Clock;
  readonly services: {
    readonly mailSync: ReturnType<typeof makeMailSyncService>;
    readonly mailFullSync: ReturnType<typeof makeMailFullSyncService>;
    readonly receiptParse: ReturnType<typeof makeReceiptParseService>;
    readonly receiptMatch: ReturnType<typeof makeReceiptMatchService>;
  };
  setupUser(input?: {
    readonly userId?: UserId;
    readonly gmailAddress?: string;
    readonly refreshToken?: string;
  }): Promise<{ userId: UserId; mailAccountId: MailAccountId }>;
  runSync(input: {
    readonly userId: UserId;
    readonly mailAccountId: MailAccountId;
  }): Promise<void>;
}

/**
 * In-memory mail.sync → receipt.parse → receipt.match wiring for L2 tests.
 * Mirrors production job handlers without `@expense/wiring` or BullMQ.
 */
export function makeMailPipelineHarness(
  opts: MailPipelineHarnessOptions,
): MailPipelineHarness {
  const repos = opts.repos ?? makeInMemoryRepositories();
  const queue = makeInMemoryJobQueue();
  const clock = opts.clock ?? new FixedClock(MAIL_PIPELINE_TEST_CLOCK_AT);
  const extractor = opts.extractor ?? makeFakeReceiptExtractor();
  const classifierConfig = opts.classifierConfig ?? TEST_MAIL_CLASSIFIER_CONFIG;
  const matchConfig = opts.matchConfig ?? TEST_RECEIPT_MATCH_CONFIG;
  const fullSyncQuery = opts.fullSyncQuery ?? TEST_MAIL_FULL_SYNC_QUERY;
  const fullSyncBackfillDays = opts.fullSyncBackfillDays ?? 30;

  const ingestShared = {
    mail: opts.mail,
    mailMessages: repos.mailMessages,
    queue,
    classifierConfig,
  };

  const services = {
    mailSync: makeMailSyncService({
      ...ingestShared,
      mailAccounts: repos.mailAccounts,
      clock,
    }),
    mailFullSync: makeMailFullSyncService({
      ...ingestShared,
      mailAccounts: repos.mailAccounts,
      clock,
      fullSyncQuery,
      fullSyncBackfillDays,
    }),
    receiptParse: makeReceiptParseService({
      mail: opts.mail,
      mailAccounts: repos.mailAccounts,
      mailMessages: repos.mailMessages,
      receipts: repos.receipts,
      extractor,
      queue,
      clock,
    }),
    receiptMatch: makeReceiptMatchService({
      transactions: repos.transactions,
      receipts: repos.receipts,
      mailMessages: repos.mailMessages,
      transactionReceiptLinks: repos.transactionReceiptLinks,
      clock,
      matchConfig,
      categoriesTriggerMatch: [...matchConfig.categoryBonusCategories],
    }),
  };

  queue.process("mail.sync", (payload) => services.mailSync.run(payload));
  queue.process("mail.fullSync", (payload) => services.mailFullSync.run(payload));
  queue.process("receipt.parse", (payload) => services.receiptParse.run(payload));
  queue.process("receipt.match", (payload) => services.receiptMatch.run(payload));

  return {
    repos,
    queue,
    clock,
    services,
    async setupUser(input = {}) {
      const userId = input.userId ?? newId<"UserId">();
      const account = await repos.mailAccounts.create(
        {
          userId,
          gmailAddress: input.gmailAddress ?? "shopper@gmail.com",
        },
        input.refreshToken ?? "refresh-token",
      );
      return { userId, mailAccountId: account.id };
    },
    async runSync(input) {
      await queue.enqueue(
        "mail.sync",
        { userId: input.userId, mailAccountId: input.mailAccountId },
        { jobId: `mail.sync:${input.mailAccountId}` },
      );
      await queue.drain();
    },
  };
}
