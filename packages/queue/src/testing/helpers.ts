import type { JobName } from "@expense/core";
import { Queue } from "bullmq";
import { toBullConnection, type RedisConnection } from "../connection.js";
import { DEAD_LETTER_QUEUE } from "../dead-letter.js";
import { JOB_NAMES } from "../jobs.js";

export const TEST_REDIS_URL =
  process.env.REDIS_URL ?? "redis://localhost:6379";

export const TEST_QUEUE_PREFIX = "expense-test";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Remove all jobs from test queues between integration tests. */
export async function obliterateTestQueues(deps: {
  connection: RedisConnection;
  prefix?: string;
}): Promise<void> {
  const prefix = deps.prefix ?? TEST_QUEUE_PREFIX;
  const names: string[] = [...JOB_NAMES, DEAD_LETTER_QUEUE];
  for (const name of names) {
    const q = new Queue(name, {
      connection: toBullConnection(deps.connection),
      prefix,
    });
    await q.obliterate({ force: true });
    await q.close();
  }
}

/** Poll until no jobs remain waiting, active, or delayed. */
export async function waitForQueuesIdle(deps: {
  connection: RedisConnection;
  names?: JobName[];
  prefix?: string;
  timeoutMs?: number;
}): Promise<void> {
  const names = deps.names ?? JOB_NAMES;
  const prefix = deps.prefix ?? TEST_QUEUE_PREFIX;
  const deadline = Date.now() + (deps.timeoutMs ?? 15_000);

  while (Date.now() < deadline) {
    let pending = 0;
    for (const name of names) {
      const q = new Queue(name, {
      connection: toBullConnection(deps.connection),
      prefix,
    });
      const counts = await q.getJobCounts("waiting", "active", "delayed");
      pending += (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
      await q.close();
    }
    if (pending === 0) return;
    await sleep(50);
  }

  throw new Error("timeout waiting for queues to drain");
}
