import type { JobConsumer, JobProducer, Logger } from "@expense/core";
import { makeInMemoryJobQueue } from "@expense/core/testing";
import { toQueueSettings, type AppConfig, type Env } from "@expense/config";
import { makeJobQueue, type JobQueueBundle } from "@expense/queue";
import type { WorkerWiringOptions } from "./types.js";

/** Full queue — producer + consumer for worker processes and in-memory e2e. */
export function resolveWorkerQueue(
  env: Env,
  log: Logger,
  app: AppConfig,
  opts: WorkerWiringOptions,
): {
  producer: JobProducer;
  consumer: JobConsumer;
  drain?: (log?: Logger) => Promise<void>;
  closeQueue?: () => Promise<void>;
} {
  if (opts.useBullMQ) {
    const settings = toQueueSettings(app, opts.queuePrefix);
    const bundle: JobQueueBundle = makeJobQueue(env.REDIS_URL, log, settings);
    return {
      producer: bundle.producer,
      consumer: bundle.consumer,
      closeQueue: () => bundle.close(),
    };
  }

  const inMemory = makeInMemoryJobQueue(log);
  return {
    producer: inMemory,
    consumer: inMemory,
    drain: (drainLog) => inMemory.drain(drainLog ?? log),
  };
}
