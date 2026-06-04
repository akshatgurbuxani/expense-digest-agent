import { describe, it, expect } from "vitest";
import type { JobProducer } from "../../ports/jobs.js";
import { newId } from "../../ids.js";

/** Shared contract every JobProducer adapter must satisfy. */
export function jobProducerContract(
  makeProducer: () => JobProducer,
  label: string,
) {
  describe(`JobProducer contract (${label})`, () => {
    it("accepts enqueue without throwing", async () => {
      const producer = makeProducer();
      const userId = newId<"UserId">();
      await producer.enqueue("baseline.recompute", { userId });
    });

    it("accepts duplicate jobId enqueue without throwing", async () => {
      const producer = makeProducer();
      const userId = newId<"UserId">();
      const jobId = `digest:${userId}:2026-W21`;
      await producer.enqueue(
        "digest.generate",
        { userId, isoWeek: "2026-W21" },
        { jobId },
      );
      await producer.enqueue(
        "digest.generate",
        { userId, isoWeek: "2026-W21" },
        { jobId },
      );
    });
  });
}

/** BullMQ-specific assertions layered on the shared contract. */
export function jobProducerIdempotencyContract(
  makeCtx: () => Promise<{
    producer: JobProducer;
    pendingCount: () => Promise<number>;
  }>,
  label: string,
) {
  describe(`JobProducer idempotency (${label})`, () => {
    it("digest:{userId}:{isoWeek} twice yields one pending job", async () => {
      const { producer, pendingCount } = await makeCtx();
      const userId = newId<"UserId">();
      const jobId = `digest:${userId}:2026-W21`;
      await producer.enqueue(
        "digest.generate",
        { userId, isoWeek: "2026-W21" },
        { jobId },
      );
      await producer.enqueue(
        "digest.generate",
        { userId, isoWeek: "2026-W21" },
        { jobId },
      );
      expect(await pendingCount()).toBe(1);
    });
  });
}
