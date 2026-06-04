import type { JobProducer, Logger } from "@expense/core";
import { makeInMemoryJobQueue } from "@expense/core/testing";
import { toQueueSettings, type AppConfig, type Env } from "@expense/config";
import { makeJobProducer, makeRedisConnection } from "@expense/queue";
import type { ApiWiringOptions } from "./types.js";

/** Producer only — API and scheduler enqueue jobs without starting a consumer. */
export function resolveProducer(
  env: Env,
  log: Logger,
  app: AppConfig,
  opts: ApiWiringOptions,
): {
  producer: JobProducer;
  closeProducer?: () => Promise<void>;
} {
  if (opts.useBullMQ) {
    const connection = makeRedisConnection(env.REDIS_URL);
    const settings = toQueueSettings(app, opts.queuePrefix);
    const producer = makeJobProducer({ connection, log, settings });
    return {
      producer,
      closeProducer: async () => {
        await connection.quit();
      },
    };
  }

  const inMemory = makeInMemoryJobQueue();
  return { producer: inMemory };
}
