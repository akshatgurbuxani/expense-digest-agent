import { afterAll, beforeEach, describe, it, expect } from "vitest";
import {
  InvariantError,
  UpstreamError,
  ValidationError,
} from "@expense/core";
import { makeNullLogger } from "@expense/core/testing";
import { newId } from "@expense/core";
import { Queue } from "bullmq";
import { makeJobConsumer } from "./consumer.js";
import { makeRedisConnection, toBullConnection } from "./connection.js";
import {
  listDeadLetterEntries,
  makeMoveToDeadLetter,
} from "./dead-letter.js";
import { toQueueSettings } from "@expense/config";
import { makeTestAppConfig } from "@expense/config/testing";
import { makeJobProducer } from "./producer.js";
import {
  obliterateTestQueues,
  TEST_QUEUE_PREFIX,
  TEST_REDIS_URL,
  waitForQueuesIdle,
} from "./testing/helpers.js";

const log = makeNullLogger();
const connection = makeRedisConnection(TEST_REDIS_URL);
const prefix = `${TEST_QUEUE_PREFIX}:consumer`;
const queueSettings = () => toQueueSettings(makeTestAppConfig(), prefix);

beforeEach(async () => {
  await obliterateTestQueues({ connection, prefix });
});

afterAll(async () => {
  await connection.quit();
});

describe("JobConsumer (BullMQ)", () => {
  it("retries retryable errors before succeeding", async () => {
    const moveToDeadLetter = makeMoveToDeadLetter({ connection, prefix, log });
    const consumer = makeJobConsumer({
      connection,
      log,
      moveToDeadLetter,
      settings: queueSettings(),
    });
    const producer = makeJobProducer({ connection, log, settings: queueSettings() });

    let attempts = 0;
    consumer.process("baseline.recompute", async () => {
      attempts += 1;
      if (attempts < 2) throw new UpstreamError("transient");
    });

    await consumer.start();
    const userId = newId<"UserId">();
    await producer.enqueue("baseline.recompute", { userId });
    await waitForQueuesIdle({
      connection,
      names: ["baseline.recompute"],
      prefix,
    });
    await consumer.stop();

    expect(attempts).toBe(2);
    expect(await listDeadLetterEntries({ connection, prefix })).toHaveLength(0);
  });

  it("moves non-retryable errors straight to the dead-letter queue", async () => {
    const moveToDeadLetter = makeMoveToDeadLetter({ connection, prefix, log });
    const consumer = makeJobConsumer({
      connection,
      log,
      moveToDeadLetter,
      settings: queueSettings(),
    });
    const producer = makeJobProducer({ connection, log, settings: queueSettings() });

    let attempts = 0;
    consumer.process("baseline.recompute", async () => {
      attempts += 1;
      throw new ValidationError("bad payload shape");
    });

    await consumer.start();
    await producer.enqueue("baseline.recompute", {
      userId: newId<"UserId">(),
    });
    await waitForQueuesIdle({
      connection,
      names: ["baseline.recompute"],
      prefix,
    });
    await consumer.stop();

    expect(attempts).toBe(1);
    const dlq = await listDeadLetterEntries({ connection, prefix });
    expect(dlq).toHaveLength(1);
    expect(dlq[0]?.code).toBe("validation");
  });

  it("stop() waits for an in-flight job to finish", async () => {
    const moveToDeadLetter = makeMoveToDeadLetter({ connection, prefix, log });
    const consumer = makeJobConsumer({
      connection,
      log,
      moveToDeadLetter,
      settings: queueSettings(),
    });
    const producer = makeJobProducer({ connection, log, settings: queueSettings() });

    let finished = false;
    consumer.process("baseline.recompute", async () => {
      await new Promise((r) => setTimeout(r, 150));
      finished = true;
    });

    await consumer.start();
    await producer.enqueue("baseline.recompute", {
      userId: newId<"UserId">(),
    });

    await new Promise((r) => setTimeout(r, 30));
    await consumer.stop();

    expect(finished).toBe(true);
  });

  it("rejects invalid payloads at process time", async () => {
    const moveToDeadLetter = makeMoveToDeadLetter({ connection, prefix, log });
    const consumer = makeJobConsumer({
      connection,
      log,
      moveToDeadLetter,
      settings: queueSettings(),
    });

    consumer.process("baseline.recompute", async () => {
      throw new InvariantError("should not run");
    });

    await consumer.start();
    const queue = new Queue("baseline.recompute", {
      connection: toBullConnection(connection),
      prefix,
    });
    await queue.add("baseline.recompute", { notValid: true });
    await waitForQueuesIdle({
      connection,
      names: ["baseline.recompute"],
      prefix,
    });
    await consumer.stop();

    const dlq = await listDeadLetterEntries({ connection, prefix });
    expect(dlq).toHaveLength(1);
    expect(dlq[0]?.code).toBe("validation");
  });
});
