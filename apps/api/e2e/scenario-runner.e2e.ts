import { describe, it } from "vitest";
import {
  makeInMemoryRepositories,
  type TestRepositories,
  expandScenario,
  seedScenarioUsers,
  makeMultiUserBank,
  makeMailProvider,
  loadScenario,
  assertExpectations,
  FixedClock,
} from "@expense/core/testing";
import { weekWindowFor, isoWeekLabel } from "@expense/core";
import { makeTestConfig } from "@expense/config/testing";
import { buildWorkerContainer } from "@expense/workers/composition-root";
import { registerJobHandlers } from "@expense/workers/job-handlers";

function clearProcessedJobs(queue: any): void {
  if (Array.isArray(queue.jobs)) {
    queue.jobs.length = 0;
  }
}

describe("scenario-runner", () => {
  it("runs the full pipeline with configured number of users", async () => {
    const scenario = await loadScenario("e2e/default");
    const msPerDay = 86400000;
    const tz = "America/Los_Angeles";
    const fixedClock = new FixedClock(new Date("2026-05-27T12:00:00.000Z"));
    const clockDate = fixedClock.now();

    const repos = makeInMemoryRepositories();
    const users = expandScenario(scenario);
    const contexts = seedScenarioUsers(users, repos as TestRepositories);
    const bank = makeMultiUserBank(users, contexts, clockDate);
    const mail = makeMailProvider(users);

    const container = buildWorkerContainer({
      config: makeTestConfig({ env: { LOG_LEVEL: "info" } }),
      clock: fixedClock,
      bank,
      mail,
      repos,
    });
    registerJobHandlers(container.consumer, container.services);

    // Phase 1: sync → categorize → baseline → anomaly
    for (const ctx of contexts) {
      await container.producer.enqueue("txn.sync", {
        userId: ctx.userId,
        itemId: ctx.itemId,
      });
    }
    await container.drain!(container.log);
    const phase1Jobs = ((container.producer as any).jobs ?? []).map((j: any) => j.name) as string[];

    clearProcessedJobs(container.producer as any);

    // Phase 2: mail.sync → receipt.parse → receipt.match (for users with mail)
    const mailUsers = contexts.filter((ctx) => ctx.mailAccountId);
    if (mailUsers.length > 0) {
      for (const ctx of mailUsers) {
        await container.producer.enqueue("mail.sync", {
          userId: ctx.userId,
          mailAccountId: ctx.mailAccountId!,
        });
      }
      await container.drain!(container.log);
    }
    const phase2Jobs = ((container.producer as any).jobs ?? []).map((j: any) => j.name) as string[];

    clearProcessedJobs(container.producer as any);

    // Phase 3: generate digests for each historical week + current week
    const window = weekWindowFor(tz, clockDate);

    // Historical weeks (4 → 1)
    for (let w = 4; w >= 1; w--) {
      const weekEnd = new Date(window.start.getTime() - (w - 1) * 7 * msPerDay);
      fixedClock.set(weekEnd);
      for (const ctx of contexts) {
        await container.producer.enqueue("digest.generate", {
          userId: ctx.userId,
          isoWeek: isoWeekLabel(tz, weekEnd),
        });
      }
      await container.drain!(container.log);
      clearProcessedJobs(container.producer as any);
    }

    // Current week
    fixedClock.set(clockDate);
    for (const ctx of contexts) {
      await container.producer.enqueue("digest.generate", {
        userId: ctx.userId,
        isoWeek: isoWeekLabel(tz, clockDate),
      });
    }
    await container.drain!(container.log);
    const phase3Jobs = ((container.producer as any).jobs ?? []).map((j: any) => j.name) as string[];
    const allJobs = [...new Set([...phase1Jobs, ...phase2Jobs, ...phase3Jobs])];

    // Collect actual outcomes
    const digests = new Array<any>();
    const anomalies = new Array<any>();
    const deliveries = container.emailChannel?.sent ?? [];

    for (const ctx of contexts) {
      const userDigests = await container.repos.digests.history(ctx.userId, 10);
      digests.push(...userDigests);
      const userAnomalies = await container.repos.anomalies.listRecent(ctx.userId, 10);
      anomalies.push(...userAnomalies);
    }

    // Print generated reports for visual inspection
    for (let i = 0; i < contexts.length; i++) {
      const ctx = contexts[i]!;
      const user = users[i]!;
      const userDigests = digests
        .filter((d) => d.userId === ctx.userId)
        .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
      for (const d of userDigests) {
        console.log(`\n========== REPORT FOR ${user.email} (${d.weekStart.toISOString().slice(0, 10)} — ${d.weekEnd.toISOString().slice(0, 10)}) ==========`);
        console.log(`Subject: ${d.subject}`);
        console.log(`${d.content}`);
      }
    }

    // Assert expectations
    assertExpectations(scenario, {
      digests,
      anomalies,
      deliveries,
      jobsEnqueued: allJobs,
    });
  });
});
