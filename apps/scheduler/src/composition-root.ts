import {
  makeSchedulerService,
  type Clock,
  InvariantError,
} from "@expense/core";
import {
  makeCrypto,
  makeLogger,
  makeSystemClock,
  toReportScheduleConfig,
  type AppConfig,
  type Config,
  type Env,
} from "@expense/config";
import { makePrisma, makeRepositories, type PrismaClient } from "@expense/db";
import type { Logger } from "@expense/core";
import { resolveConfig, resolveProducer } from "@expense/wiring";

export interface SchedulerContainerOptions {
  config?: Config;
  env?: Env;
  app?: AppConfig;
  clock?: Clock;
  queuePrefix?: string;
}

export interface SchedulerContainer {
  env: Env;
  app: AppConfig;
  log: Logger;
  prisma: PrismaClient;
  scheduler: ReturnType<typeof makeSchedulerService>;
  close: () => Promise<void>;
}

/** Composition root for the digest scheduler process. */
export function buildSchedulerContainer(
  opts: SchedulerContainerOptions = {},
): SchedulerContainer {
  const { env, app } = resolveConfig(opts);
  const log = makeLogger({ level: env.LOG_LEVEL });
  const clock = opts.clock ?? makeSystemClock();

  if (!env.ENCRYPTION_KEY) {
    throw new InvariantError(
      "ENCRYPTION_KEY is required for the scheduler (Postgres repos)",
    );
  }

  const prisma = makePrisma(env.DATABASE_URL);
  const repos = makeRepositories(prisma, makeCrypto(env.ENCRYPTION_KEY));
  const { producer, closeProducer } = resolveProducer(env, log, app, {
    ...opts,
    useBullMQ: true,
  });

  const scheduler = makeSchedulerService({
    users: repos.users,
    mailAccounts: repos.mailAccounts,
    queue: producer,
    clock,
    reportSchedule: toReportScheduleConfig(app),
  });

  return {
    env,
    app,
    log,
    prisma,
    scheduler,
    close: async () => {
      await closeProducer?.();
    },
  };
}
