import { beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { Money, newId } from "@expense/core";
import { aUser, FixedClock, makeFakeBank } from "@expense/core/testing";
import {
  TEST_ENCRYPTION_KEY,
  clearDatabase,
  insertAccount,
  insertUser,
} from "@expense/db/testing";
import { buildApiContainer } from "../src/composition-root.js";
import { buildWorkerContainer } from "@expense/workers/composition-root";
import { createApp } from "../src/create-app.js";
import { registerJobHandlers } from "@expense/workers/job-handlers";
import { makeTestConfig, makeTestEnv } from "@expense/config/testing";

describe("webhook → digest heartbeat (Postgres)", () => {
  const env = makeTestEnv({ ENCRYPTION_KEY: TEST_ENCRYPTION_KEY });
  const testConfig = () => makeTestConfig({ env: { ENCRYPTION_KEY: TEST_ENCRYPTION_KEY } });
  const plaidItemId = "plaid-item-heartbeat-db";

  beforeEach(async () => {
    const probe = buildApiContainer({ config: testConfig(), useDatabase: true });
    if (!probe.prisma) throw new Error("expected prisma client");
    await clearDatabase(probe.prisma);
  });

  it("runs the full pipeline against Prisma repositories", async () => {
    const user = aUser({
      timezone: "UTC",
      email: `heartbeat-db-${newId()}@test.example.com`,
    });
    const accountId = newId<"AccountId">();

    const bank = makeFakeBank({
      syncPages: [
        {
          added: [
            {
              plaidTransactionId: "txn-heartbeat-db-1",
              plaidAccountId: "plaid-acct-heartbeat-db",
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

    const container = buildWorkerContainer({ config: testConfig(), bank, clock, useDatabase: true });
    registerJobHandlers(container.consumer, container.services);

    await insertUser(container.prisma!, user);
    const item = await container.repos.items.create(
      { userId: user.id, plaidItemId },
      "access-token-heartbeat-db",
    );
    await insertAccount(container.prisma!, {
      id: accountId,
      itemId: item.id,
      userId: user.id,
      plaidAccountId: "plaid-acct-heartbeat-db",
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

    await container.drain!(container.log);

    await container.producer.enqueue("digest.generate", {
      userId: user.id,
      isoWeek: "2026-W21",
    });
    await container.drain!(container.log);

    const digests = await container.repos.digests.history(user.id, 5);
    expect(digests).toHaveLength(1);
    expect(digests[0]?.content).toContain("$45.00");
    expect(digests[0]?.deliveredAt).not.toBeNull();
    expect(container.emailChannel!.sent[0]?.body).toContain("$45.00");
  });
});
