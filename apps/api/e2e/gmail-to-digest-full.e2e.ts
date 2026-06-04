import { afterAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { aUser } from "@expense/core/testing";
import { makePrisma } from "@expense/db";
import {
  TEST_DATABASE_URL,
  TEST_ENCRYPTION_KEY,
  clearDatabase,
} from "@expense/db/testing";
import { makeRedisConnection } from "@expense/queue";
import {
  obliterateTestQueues,
  TEST_QUEUE_PREFIX,
  waitForQueuesIdle,
} from "@expense/queue/testing";
import { makeTestConfig, makeTestEnv } from "@expense/config/testing";
import { buildWorkerContainer } from "@expense/workers/composition-root";
import { createApp } from "../src/create-app.js";
import { registerJobHandlers } from "@expense/workers/job-handlers";
import {
  buildGmailPushRequestBody,
  buildGmailReceiptE2eMail,
  GMAIL_RECEIPT_E2E_CLOCK,
  GMAIL_RECEIPT_E2E_ISO_WEEK,
  gmailReceiptScenario,
  seedGmailReceiptE2e,
} from "./helpers/receipt-e2e-fixture.js";

describe("gmail → digest heartbeat (Postgres + BullMQ)", () => {
  const env = makeTestEnv({ ENCRYPTION_KEY: TEST_ENCRYPTION_KEY });
  const queuePrefix = `${TEST_QUEUE_PREFIX}:gmail-e2e`;
  const redis = makeRedisConnection(env.REDIS_URL);

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

  it("runs gmail push through Redis queues and Prisma repos into digest facts", async () => {
    const scenario = gmailReceiptScenario("amazon-happy-path");
    const user = aUser({
      timezone: "UTC",
      email: `gmail-e2e-${Date.now()}@test.example.com`,
    });
    const mail = buildGmailReceiptE2eMail(scenario);

    const container = buildWorkerContainer({
      config: makeTestConfig({ env: { ENCRYPTION_KEY: TEST_ENCRYPTION_KEY } }),
      mail,
      clock: GMAIL_RECEIPT_E2E_CLOCK,
      useDatabase: true,
      useBullMQ: true,
      queuePrefix,
    });
    registerJobHandlers(container.consumer, container.services);
    await container.consumer.start();

    try {
      const { transactionId } = await seedGmailReceiptE2e({
        repos: container.repos,
        user,
        scenario,
        prisma: container.prisma,
      });

      const app = createApp(container);
      await request(app)
        .post("/webhooks/gmail")
        .set("Content-Type", "application/json")
        .send(buildGmailPushRequestBody())
        .expect(200);

      await waitForQueuesIdle({ connection: redis, prefix: queuePrefix });

      const link = await container.repos.transactionReceiptLinks.findByTransactionId(
        user.id,
        transactionId!,
      );
      expect(link).not.toBeNull();

      GMAIL_RECEIPT_E2E_CLOCK.advance(60_000);

      await container.producer.enqueue("digest.generate", {
        userId: user.id,
        isoWeek: GMAIL_RECEIPT_E2E_ISO_WEEK,
      });
      await waitForQueuesIdle({ connection: redis, prefix: queuePrefix });

      const digests = await container.repos.digests.history(user.id, 5);
      expect(digests).toHaveLength(1);
      expect(digests[0]?.facts.matchedReceipts).toHaveLength(1);
      expect(digests[0]?.facts.matchedReceipts[0]?.receiptAmount).toBe("$45.99");
      expect(digests[0]?.deliveredAt).not.toBeNull();
      expect(container.emailChannel!.sent[0]?.body).toContain(
        "RECEIPTS MATCHED TO CHARGES",
      );
    } finally {
      await container.consumer.stop();
      await container.closeQueue?.();
    }
  });
});
