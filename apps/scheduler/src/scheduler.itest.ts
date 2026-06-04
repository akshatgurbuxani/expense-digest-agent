import { afterAll, beforeEach, describe, it, expect } from "vitest";
import {
  makeSchedulerService,
  type UserRepository,
} from "@expense/core";
import {
  FixedClock,
  aUser,
  makeInMemoryRepositories,
  makeNullLogger,
} from "@expense/core/testing";
import { toQueueSettings } from "@expense/config";
import { makeTestAppConfig } from "@expense/config/testing";
import {
  countPendingJobs,
  makeJobProducer,
  makeRedisConnection,
} from "@expense/queue";
import {
  obliterateTestQueues,
  TEST_QUEUE_PREFIX,
  TEST_REDIS_URL,
} from "@expense/queue/testing";

const log = makeNullLogger();
const connection = makeRedisConnection(TEST_REDIS_URL);
const prefix = `${TEST_QUEUE_PREFIX}:scheduler`;

beforeEach(async () => {
  await obliterateTestQueues({ connection, prefix });
});

afterAll(async () => {
  await connection.quit();
});

describe("SchedulerService (BullMQ)", () => {
  it("tick twice in the same minute leaves one pending digest.generate job", async () => {
    const at = new Date("2026-05-24T08:00:00.000Z");
    const user = aUser({
      timezone: "UTC",
      digestDay: 0,
      digestTime: "08:00",
    });
    const users: UserRepository = {
      findById: async () => user,
      findDueForDigest: async () => [user],
      findDueForMonthlyReport: async () => [],
      updatePreferences: async () => {},
    };

    const producer = makeJobProducer({
      connection,
      log,
      settings: toQueueSettings(makeTestAppConfig(), prefix),
    });
    const scheduler = makeSchedulerService({
      users,
      queue: producer,
      clock: new FixedClock(at),
    });

    await scheduler.tick();
    await scheduler.tick();

    expect(
      await countPendingJobs({ connection, name: "digest.generate", prefix }),
    ).toBe(1);
  });

  it("tick twice leaves one mail.watch job per active account per day", async () => {
    const at = new Date("2026-05-24T08:00:00.000Z");
    const repos = makeInMemoryRepositories();
    const user = aUser();
    repos._seed.user(user);
    await repos.mailAccounts.create(
      { userId: user.id, gmailAddress: "watch@gmail.com" },
      "refresh",
    );

    const users: UserRepository = {
      findById: async () => user,
      findDueForDigest: async () => [],
      findDueForMonthlyReport: async () => [],
      updatePreferences: async () => {},
    };

    const producer = makeJobProducer({
      connection,
      log,
      settings: toQueueSettings(makeTestAppConfig(), prefix),
    });
    const scheduler = makeSchedulerService({
      users,
      mailAccounts: repos.mailAccounts,
      queue: producer,
      clock: new FixedClock(at),
    });

    await scheduler.tick();
    await scheduler.tick();

    expect(
      await countPendingJobs({ connection, name: "mail.watch", prefix }),
    ).toBe(1);
  });
});
