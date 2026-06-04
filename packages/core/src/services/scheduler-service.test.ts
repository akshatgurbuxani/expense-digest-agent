import { describe, it, expect } from "vitest";
import type { UserRepository } from "../ports/repositories.js";
import { makeSchedulerService } from "./scheduler-service.js";
import { makeCapturingJobProducer } from "../testing/capturing-jobs.js";
import { FixedClock } from "../testing/fixed-clock.js";
import { aUser } from "../testing/builders.js";
import { makeInMemoryRepositories } from "../testing/in-memory-repos.js";
import { digestJobId } from "../iso-week.js";

function stubUsers(due: ReturnType<typeof aUser>[]): UserRepository {
  return {
    findById: async (id) => due.find((u) => u.id === id) ?? null,
    findDueForDigest: async () => due,
    findDueForMonthlyReport: async () => [],
    updatePreferences: async () => {},
  };
}

describe("makeSchedulerService", () => {
  const at = new Date("2026-05-24T08:00:00.000Z");

  it("enqueues one idempotent digest.generate per due user", async () => {
    const user1 = aUser({
      timezone: "UTC",
      digestDay: 0,
      digestTime: "08:00",
    });
    const user2 = aUser({
      timezone: "UTC",
      digestDay: 0,
      digestTime: "08:00",
    });
    const queue = makeCapturingJobProducer();
    const svc = makeSchedulerService({
      users: stubUsers([user1, user2]),
      queue,
      clock: new FixedClock(at),
    });

    const result = await svc.tick();

    expect(result.due).toBe(2);
    expect(queue.jobs).toHaveLength(2);
    expect(queue.jobs.every((j) => j.name === "digest.generate")).toBe(true);

    for (const user of [user1, user2]) {
      const job = queue.jobs.find(
        (j) =>
          j.name === "digest.generate" && j.payload.userId === user.id,
      );
      expect(job?.payload).toMatchObject({
        userId: user.id,
        isoWeek: "2026-W21",
      });
      expect(job?.opts?.jobId).toBe(digestJobId(user.id, "2026-W21"));
    }
  });

  it("does not enqueue duplicates when tick runs twice in the same minute", async () => {
    const user = aUser({
      timezone: "UTC",
      digestDay: 0,
      digestTime: "08:00",
    });
    const queue = makeCapturingJobProducer();
    const svc = makeSchedulerService({
      users: stubUsers([user]),
      queue,
      clock: new FixedClock(at),
    });

    await svc.tick();
    await svc.tick();

    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobIds.size).toBe(1);
  });

  it("enqueues nothing when no users are due", async () => {
    const queue = makeCapturingJobProducer();
    const svc = makeSchedulerService({
      users: stubUsers([]),
      queue,
      clock: new FixedClock(at),
    });

    const result = await svc.tick();

    expect(result.due).toBe(0);
    expect(result.monthlyReports).toBe(0);
    expect(result.mailWatch).toBe(0);
    expect(queue.jobs).toHaveLength(0);
  });

  it("enqueues idempotent mail.watch for each active mail account", async () => {
    const queue = makeCapturingJobProducer();
    const repos = makeInMemoryRepositories();
    const user = aUser();
    repos._seed.user(user);
    const account = await repos.mailAccounts.create(
      { userId: user.id, gmailAddress: "watch@gmail.com" },
      "refresh",
    );

    const svc = makeSchedulerService({
      users: stubUsers([]),
      mailAccounts: repos.mailAccounts,
      queue,
      clock: new FixedClock(at),
    });

    const result = await svc.tick();

    expect(result.mailWatch).toBe(1);
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]).toMatchObject({
      name: "mail.watch",
      payload: { userId: user.id, mailAccountId: account.id },
    });
    expect(queue.jobs[0]?.opts?.jobId).toBe(`mail.watch:${account.id}:2026-05-24`);
  });

  it("enqueues idempotent report.generate on the monthly schedule", async () => {
    const queue = makeCapturingJobProducer();
    const user = aUser({ timezone: "UTC" });
    const at = new Date("2026-06-01T09:00:00.000Z");

    const svc = makeSchedulerService({
      users: {
        findById: async () => user,
        findDueForDigest: async () => [],
        findDueForMonthlyReport: async () => [user],
        updatePreferences: async () => {},
      },
      queue,
      clock: new FixedClock(at),
      reportSchedule: { monthlyDay: 1, deliveryHour: 9 },
    });

    const result = await svc.tick();

    expect(result.monthlyReports).toBe(1);
    expect(queue.jobs[0]).toMatchObject({
      name: "report.generate",
      payload: { userId: user.id, yearMonth: "2026-05" },
    });
    expect(queue.jobs[0]?.opts?.jobId).toBe(`report:${user.id}:2026-05`);
  });
});
