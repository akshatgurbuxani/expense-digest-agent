import { afterAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { Money, newId } from "@expense/core";
import { aUser, FixedClock, makeFakeBank } from "@expense/core/testing";
import { makePrisma } from "@expense/db";
import {
  TEST_ENCRYPTION_KEY,
  TEST_DATABASE_URL,
  clearDatabase,
  insertAccount,
  insertUser,
} from "@expense/db/testing";
import { makeRedisConnection } from "@expense/queue";
import {
  obliterateTestQueues,
  TEST_QUEUE_PREFIX,
  waitForQueuesIdle,
} from "@expense/queue/testing";
import { buildWorkerContainer } from "@expense/workers/composition-root";
import { createApp } from "../src/create-app.js";
import { registerJobHandlers } from "@expense/workers/job-handlers";
import { makeTestConfig, makeTestEnv } from "@expense/config/testing";

describe("webhook → digest heartbeat (Postgres + BullMQ)", () => {
  const env = makeTestEnv({ ENCRYPTION_KEY: TEST_ENCRYPTION_KEY });
  const queuePrefix = `${TEST_QUEUE_PREFIX}:full-e2e`;
  const redis = makeRedisConnection(env.REDIS_URL);
  const plaidItemId = "plaid-item-heartbeat-full";

  beforeEach(async () => {
    const prisma = makePrisma(TEST_DATABASE_URL);
    try {
      await clearDatabase(prisma);
    } finally {
      await prisma.$disconnect();
    }
    await obliterateTestQueues({ connection: redis, prefix: queuePrefix });
  });

  afterAll(async () => {
    await redis.quit();
  });

  it("runs the full pipeline through Redis queues and Prisma repos", async () => {
    const user = aUser({
      timezone: "UTC",
      email: `heartbeat-full-${newId()}@test.example.com`,
    });
    const accountId = newId<"AccountId">();

    const bank = makeFakeBank({
      syncPages: [
        {
          added: [
            {
              plaidTransactionId: "txn-heartbeat-full-1",
              plaidAccountId: "plaid-acct-heartbeat-full",
              amount: Money.of(4500, "USD"),
              merchantNameRaw: "STARBUCKS STORE 123",
              plaidPfc: null,
              occurredAt: new Date("2026-05-24T12:00:00.000Z"),
            },
          ],
          modified: [],
          removed: [],
          nextCursor: "cursor-done",
          hasMore: false,
        },
      ],
      webhook: {
        itemId: plaidItemId,
        type: "TRANSACTIONS",
        code: "SYNC_UPDATES_AVAILABLE",
      },
    });

    const clock = new FixedClock(new Date("2026-05-25T12:00:00.000Z"));

    const container = buildWorkerContainer({
      config: makeTestConfig({ env: { ENCRYPTION_KEY: TEST_ENCRYPTION_KEY } }),
      bank,
      clock,
      useDatabase: true,
      useBullMQ: true,
      queuePrefix,
    });
    registerJobHandlers(container.consumer, container.services);
    await container.consumer.start();

    try {
      await insertUser(container.prisma!, user);
      const item = await container.repos.items.create(
        { userId: user.id, plaidItemId },
        "access-token-heartbeat-full",
      );
      await insertAccount(container.prisma!, {
        id: accountId,
        itemId: item.id,
        userId: user.id,
        plaidAccountId: "plaid-acct-heartbeat-full",
        name: "Checking",
        type: "depository",
        lastSyncedAt: null,
      });

      const app = createApp(container);

      await request(app)
        .post("/webhooks/plaid")
        .set("Plaid-Verification", "fake-jwt")
        .send({ webhook_type: "TRANSACTIONS" })
        .expect(200);

      await waitForQueuesIdle({ connection: redis, prefix: queuePrefix });

      await container.producer.enqueue("digest.generate", {
        userId: user.id,
        isoWeek: "2026-W21",
      });
      await waitForQueuesIdle({ connection: redis, prefix: queuePrefix });

      const digests = await container.repos.digests.history(user.id, 5);
      expect(digests).toHaveLength(1);
      expect(digests[0]?.content).toContain("$45.00");
      expect(digests[0]?.deliveredAt).not.toBeNull();
      expect(container.emailChannel!.sent[0]?.body).toContain("$45.00");
    } finally {
      await container.consumer.stop();
      await container.closeQueue?.();
    }
  });
});
