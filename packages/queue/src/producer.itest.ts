import { afterAll, beforeEach } from "vitest";
import { makeNullLogger } from "@expense/core/testing";
import {
  jobProducerContract,
  jobProducerIdempotencyContract,
} from "@expense/core/testing/contracts";
import { toQueueSettings } from "@expense/config";
import { makeTestAppConfig } from "@expense/config/testing";
import {
  countPendingJobs,
  makeJobProducer,
} from "./producer.js";
import { makeRedisConnection } from "./connection.js";
import {
  obliterateTestQueues,
  TEST_QUEUE_PREFIX,
  TEST_REDIS_URL,
} from "./testing/helpers.js";

const log = makeNullLogger();
const connection = makeRedisConnection(TEST_REDIS_URL);
const prefix = `${TEST_QUEUE_PREFIX}:producer`;
const queueSettings = () => toQueueSettings(makeTestAppConfig(), prefix);

beforeEach(async () => {
  await obliterateTestQueues({ connection, prefix });
});

afterAll(async () => {
  await connection.quit();
});

jobProducerContract(
  () => makeJobProducer({ connection, log, settings: queueSettings() }),
  "BullMQ",
);

jobProducerIdempotencyContract(async () => {
  const producer = makeJobProducer({ connection, log, settings: queueSettings() });
  return {
    producer,
    pendingCount: () =>
      countPendingJobs({ connection, name: "digest.generate", prefix }),
  };
}, "BullMQ");
