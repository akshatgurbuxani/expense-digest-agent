import type {
  BankProvider,
  Clock,
  JobConsumer,
  JobProducer,
  LlmProvider,
  MailProvider,
  ReceiptExtractor,
  Repositories,
} from "@expense/core";
import type { TestRepositories } from "@expense/core/testing";
import type { AppConfig, Config, Env } from "@expense/config";
import type { PrismaClient } from "@expense/db";
import type { Logger } from "@expense/core";
import type {
  makeAnomalyService,
  makeBaselineService,
  makeCategorizeService,
  makeDeliveryRouter,
  makeDeliveryService,
  makeDigestService,
  makeMailFullSyncService,
  makeMailSyncService,
  makeMailWatchService,
  makeReceiptMatchService,
  makeReceiptParseService,
  makeReportService,
  makeSyncService,
} from "@expense/core";
import type { makeCapturingChannel } from "@expense/core/testing";

export interface Services {
  sync: ReturnType<typeof makeSyncService>;
  categorize: ReturnType<typeof makeCategorizeService>;
  anomaly: ReturnType<typeof makeAnomalyService>;
  baseline: ReturnType<typeof makeBaselineService>;
  digest: ReturnType<typeof makeDigestService>;
  report: ReturnType<typeof makeReportService>;
  delivery: ReturnType<typeof makeDeliveryService>;
  mailSync: ReturnType<typeof makeMailSyncService>;
  mailFullSync: ReturnType<typeof makeMailFullSyncService>;
  mailWatch: ReturnType<typeof makeMailWatchService>;
  receiptParse: ReturnType<typeof makeReceiptParseService>;
  receiptMatch: ReturnType<typeof makeReceiptMatchService>;
}

export interface WiringOptions {
  /** Full config bundle (env + app tunables from YAML). Required unless all parts passed explicitly. */
  config?: Config;
  env?: Env;
  app?: AppConfig;
  repos?: Repositories | TestRepositories;
  clock?: Clock;
  /** Wire Postgres repositories from env.DATABASE_URL (Phase 7+). */
  useDatabase?: boolean;
  /** BullMQ key prefix — isolate integration tests. Overrides app.queue.prefix. */
  queuePrefix?: string;
}

export interface ApiWiringOptions extends WiringOptions {
  bank?: BankProvider;
  mail?: MailProvider;
  /** Use BullMQ over Redis (Phase 8+). Default false in tests. */
  useBullMQ?: boolean;
}

export interface WorkerWiringOptions extends WiringOptions {
  bank?: BankProvider;
  mail?: MailProvider;
  receiptExtractor?: ReceiptExtractor;
  llm?: LlmProvider;
  /** Use BullMQ over Redis (Phase 8+). Default false in tests. */
  useBullMQ?: boolean;
  /** Force capturing delivery channels (e2e assertions). Default true when NODE_ENV=test. */
  captureDelivery?: boolean;
}

export interface ApiContainer {
  env: Env;
  app: AppConfig;
  log: Logger;
  clock: Clock;
  repos: Repositories | TestRepositories;
  prisma?: PrismaClient;
  bank: BankProvider;
  mail: MailProvider;
  producer: JobProducer;
  /** BullMQ only — close producer Redis connection on teardown. */
  closeProducer?: () => Promise<void>;
}

export interface WorkerContainer extends ApiContainer {
  consumer: JobConsumer;
  /** In-memory only — synchronous drain for fast e2e. */
  drain?: (log?: Logger) => Promise<void>;
  /** BullMQ only — close queue connection on teardown. */
  closeQueue?: () => Promise<void>;
  services: Services;
  emailChannel?: ReturnType<typeof makeCapturingChannel>;
}
