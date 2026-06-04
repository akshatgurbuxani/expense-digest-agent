import { describe, it, expect } from "vitest";
import request from "supertest";
import {
  FixedClock,
  makeInMemoryRepositories,
  type TestRepositories,
  loadE2EScenario,
  seedFromScenario,
  bankFromScenario,
  assertExpectations,
} from "@expense/core/testing";
import { makeTestConfig } from "@expense/config/testing";
import { buildWorkerContainer } from "@expense/workers/composition-root";
import { createApp } from "../src/create-app.js";
import { registerJobHandlers } from "@expense/workers/job-handlers";
import { makeInMemoryJobQueue } from "@expense/core/testing";

describe("webhook → digest heartbeat (YAML-driven)", () => {
  it("POST /webhooks/plaid enqueues sync, worker pipeline produces digest + delivery", async () => {
    // Load scenario from YAML
    const scenario = await loadE2EScenario("webhook-to-digest");
    
    // Build container with test dependencies
    const repos = makeInMemoryRepositories();
    const ctx = seedFromScenario(scenario, repos as TestRepositories);
    const bank = bankFromScenario(scenario);

    const clock = new FixedClock(new Date("2026-05-25T12:00:00.000Z"));

    const container = buildWorkerContainer({
      config: makeTestConfig({ env: { LOG_LEVEL: "info" } }),
      bank,
      repos,
      clock,
    });
    registerJobHandlers(container.consumer, container.services);

    const queue = container.producer as ReturnType<typeof makeInMemoryJobQueue>;
    const app = createApp(container);

    // Trigger: Send webhook
    await request(app)
      .post("/webhooks/plaid")
      .set("Plaid-Verification", "fake-jwt")
      .send({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE" })
      .expect(200);

    // Drain the queue (simulate workers processing)
    await container.drain!(container.log);

    // Manually trigger digest generation (normally done by scheduler)
    await container.producer.enqueue("digest.generate", {
      userId: ctx.userId,
      isoWeek: "2026-W21",
    });
    await container.drain!(container.log);

    // Collect actual outcomes
    const digests = await container.repos.digests.history(ctx.userId, 5);
    const anomalies = await container.repos.anomalies.listRecent(ctx.userId, 5);
    const deliveries = container.emailChannel!.sent;
    const jobsEnqueued = queue.jobs.map((j) => j.name);

    // Assert using scenario expectations
    assertExpectations(scenario, {
      digests,
      anomalies,
      deliveries,
      jobsEnqueued,
    });

    // Additional assertions for this specific test
    expect(digests[0]?.deliveredAt).not.toBeNull();
    expect(deliveries[0]?.to).toBe(ctx.user.email);
  });
});
