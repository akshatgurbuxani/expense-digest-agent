import {
  makeAnomalyService,
  makeBaselineService,
  makeCategorizeService,
  makeDeliveryService,
  makeDigestService,
  makeMailFullSyncService,
  makeMailSyncService,
  makeMailWatchService,
  makeReceiptMatchService,
  makeReceiptParseService,
  makeReportService,
  makeSyncService,
  type BankProvider,
  type Clock,
  type JobProducer,
  type Logger,
  type LlmProvider,
  type MailProvider,
  type ReceiptExtractor,
  type Repositories,
} from "@expense/core";
import type { makeDeliveryRouter } from "@expense/core";
import {
  toAnomalyDetectionConfig,
  toDigestFactsConfig,
  toMailCategoriesTriggerMatch,
  toMailClassifierConfig,
  toReceiptEnrichmentConfig,
  toReceiptMatchConfig,
  type AppConfig,
  type Env,
} from "@expense/config";
import { renderMonthlyReportHtml } from "@expense/delivery";
import type { Services } from "./types.js";

export function buildServices(deps: {
  repos: Repositories;
  bank: BankProvider;
  mail: MailProvider;
  receiptExtractor: ReceiptExtractor;
  producer: JobProducer;
  clock: Clock;
  llm: LlmProvider;
  router: ReturnType<typeof makeDeliveryRouter>;
  app: AppConfig;
  env: Env;
  log: Logger;
}): Services {
  const detectionConfig = toAnomalyDetectionConfig(deps.app);
  const digestFactsConfig = toDigestFactsConfig(deps.app);
  const classifierConfig = toMailClassifierConfig(deps.app);
  const matchConfig = toReceiptMatchConfig(deps.app);
  const categoriesTriggerMatch = toMailCategoriesTriggerMatch(deps.app);
  const mailIngestShared = {
    mail: deps.mail,
    mailMessages: deps.repos.mailMessages,
    queue: deps.producer,
    classifierConfig,
    log: deps.log,
  };

  return {
    sync: makeSyncService({
      items: deps.repos.items,
      accounts: deps.repos.accounts,
      transactions: deps.repos.transactions,
      bank: deps.bank,
      queue: deps.producer,
      clock: deps.clock,
      log: deps.log,
    }),
    categorize: makeCategorizeService({
      transactions: deps.repos.transactions,
      merchants: deps.repos.merchants,
      llm: deps.llm,
      queue: deps.producer,
      clock: deps.clock,
      categoriesTriggerMatch,
      log: deps.log,
    }),
    anomaly: makeAnomalyService({
      transactions: deps.repos.transactions,
      baselines: deps.repos.baselines,
      anomalies: deps.repos.anomalies,
      queue: deps.producer,
      clock: deps.clock,
      detectionConfig,
      log: deps.log,
    }),
    baseline: makeBaselineService({
      transactions: deps.repos.transactions,
      baselines: deps.repos.baselines,
      clock: deps.clock,
      log: deps.log,
    }),
    digest: makeDigestService({
      users: deps.repos.users,
      transactions: deps.repos.transactions,
      baselines: deps.repos.baselines,
      anomalies: deps.repos.anomalies,
      digests: deps.repos.digests,
      receipts: deps.repos.receipts,
      mailMessages: deps.repos.mailMessages,
      transactionReceiptLinks: deps.repos.transactionReceiptLinks,
      llm: deps.llm,
      queue: deps.producer,
      clock: deps.clock,
      log: deps.log,
      digestFactsConfig,
      receiptEnrichmentConfig: toReceiptEnrichmentConfig(deps.app),
    }),
    delivery: makeDeliveryService({
      users: deps.repos.users,
      digests: deps.repos.digests,
      reports: deps.repos.reports,
      anomalies: deps.repos.anomalies,
      router: deps.router,
      clock: deps.clock,
      renderMonthlyReportHtml,
      log: deps.log,
    }),
    report: makeReportService({
      users: deps.repos.users,
      transactions: deps.repos.transactions,
      receipts: deps.repos.receipts,
      mailMessages: deps.repos.mailMessages,
      transactionReceiptLinks: deps.repos.transactionReceiptLinks,
      reports: deps.repos.reports,
      llm: deps.llm,
      queue: deps.producer,
      clock: deps.clock,
      digestFactsConfig,
      receiptEnrichmentConfig: toReceiptEnrichmentConfig(deps.app),
      log: deps.log,
    }),
    mailSync: makeMailSyncService({
      ...mailIngestShared,
      mailAccounts: deps.repos.mailAccounts,
      clock: deps.clock,
      log: deps.log,
    }),
    mailFullSync: makeMailFullSyncService({
      ...mailIngestShared,
      mailAccounts: deps.repos.mailAccounts,
      clock: deps.clock,
      fullSyncQuery: deps.app.mail.fullSyncQuery,
      fullSyncBackfillDays: deps.app.mail.fullSyncBackfillDays,
      log: deps.log,
    }),
    mailWatch: makeMailWatchService({
      mail: deps.mail,
      mailAccounts: deps.repos.mailAccounts,
      clock: deps.clock,
      pubsubTopic: deps.env.GMAIL_PUBSUB_TOPIC,
      inboxLabelIds: deps.app.mail.inboxLabelIds,
      labelFilterBehavior: deps.app.mail.labelFilterBehavior,
      log: deps.log,
    }),
    receiptParse: makeReceiptParseService({
      mail: deps.mail,
      mailAccounts: deps.repos.mailAccounts,
      mailMessages: deps.repos.mailMessages,
      receipts: deps.repos.receipts,
      extractor: deps.receiptExtractor,
      queue: deps.producer,
      clock: deps.clock,
      log: deps.log,
    }),
    receiptMatch: makeReceiptMatchService({
      transactions: deps.repos.transactions,
      receipts: deps.repos.receipts,
      mailMessages: deps.repos.mailMessages,
      transactionReceiptLinks: deps.repos.transactionReceiptLinks,
      clock: deps.clock,
      matchConfig,
      categoriesTriggerMatch,
      log: deps.log,
    }),
  };
}
