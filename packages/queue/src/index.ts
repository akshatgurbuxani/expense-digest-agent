import type { JobProducer, JobConsumer, Logger } from "@expense/core";
import type { RedisConnection } from "./connection.js";
import { makeRedisConnection } from "./connection.js";
import { makeJobConsumer } from "./consumer.js";
import { makeMoveToDeadLetter } from "./dead-letter.js";
import { makeJobProducer } from "./producer.js";
import type { QueueSettings } from "./settings.js";

export interface JobQueueBundle {
  readonly producer: JobProducer;
  readonly consumer: JobConsumer;
  readonly connection: RedisConnection;
  readonly settings: QueueSettings;
  close(): Promise<void>;
}

/** Build a typed BullMQ producer + consumer sharing one Redis connection. */
export function makeJobQueue(
  redisUrl: string,
  log: Logger,
  settings: QueueSettings,
): JobQueueBundle {
  const connection = makeRedisConnection(redisUrl);
  const moveToDeadLetter = makeMoveToDeadLetter({
    connection,
    prefix: settings.prefix,
    log,
  });
  const producer = makeJobProducer({ connection, log, settings });
  const consumer = makeJobConsumer({
    connection,
    log,
    moveToDeadLetter,
    settings,
  });

  return {
    producer,
    consumer,
    connection,
    settings,
    async close() {
      await consumer.stop();
      await connection.quit();
    },
  };
}

export { makeRedisConnection, type RedisConnection } from "./connection.js";
export { makeJobProducer, countPendingJobs } from "./producer.js";
export { makeJobConsumer } from "./consumer.js";
export {
  makeMoveToDeadLetter,
  listDeadLetterEntries,
  DEAD_LETTER_QUEUE,
} from "./dead-letter.js";
export { runHandler } from "./run-handler.js";
export {
  JOB_SCHEMAS,
  JOB_NAMES,
  validateJobPayload,
} from "./jobs.js";
export { type QueueSettings } from "./settings.js";
