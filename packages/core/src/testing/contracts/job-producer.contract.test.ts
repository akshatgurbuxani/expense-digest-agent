import { describe, it, expect } from "vitest";
import { jobProducerContract } from "./job-producer.contract.js";
import { makeCapturingJobProducer } from "../capturing-jobs.js";
import { newId } from "../../ids.js";

jobProducerContract(() => makeCapturingJobProducer(), "CapturingJobProducer");

describe("CapturingJobProducer specifics", () => {
  it("records enqueued jobs", async () => {
    const q = makeCapturingJobProducer();
    const userId = newId<"UserId">();
    await q.enqueue("baseline.recompute", { userId });
    expect(q.jobs).toHaveLength(1);
    expect(q.jobs[0]?.name).toBe("baseline.recompute");
  });

  it("deduplicates on jobId in memory", async () => {
    const q = makeCapturingJobProducer();
    const userId = newId<"UserId">();
    const jobId = `digest:${userId}:2026-W21`;
    await q.enqueue(
      "digest.generate",
      { userId, isoWeek: "2026-W21" },
      { jobId },
    );
    await q.enqueue(
      "digest.generate",
      { userId, isoWeek: "2026-W21" },
      { jobId },
    );
    expect(q.jobs).toHaveLength(1);
    expect(q.jobIds.has(jobId)).toBe(true);
  });
});
