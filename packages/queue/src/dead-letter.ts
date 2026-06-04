import { AppError } from "@expense/core";
import type { JobName } from "@expense/core";
import type { Logger } from "@expense/core";
import { Queue } from "bullmq";
import { toBullConnection, type RedisConnection } from "./connection.js";

export const DEAD_LETTER_QUEUE = "dead-letter";

export interface DeadLetterEntry {
  readonly name: JobName;
  readonly payload: unknown;
  readonly jobId: string | undefined;
  readonly code: string;
  readonly message: string;
  readonly failedAt: string;
}

export type MoveToDeadLetter = (
  name: JobName,
  payload: unknown,
  err: unknown,
  jobId?: string,
) => Promise<void>;

export function makeMoveToDeadLetter(deps: {
  connection: RedisConnection;
  prefix?: string;
  log: Logger;
}): MoveToDeadLetter {
  const dlq = new Queue(DEAD_LETTER_QUEUE, {
    connection: toBullConnection(deps.connection),
    prefix: deps.prefix,
  });

  return async (name, payload, err, jobId) => {
    const code = err instanceof AppError ? err.code : "unknown";
    const message = err instanceof Error ? err.message : String(err);
    await dlq.add("failed", {
      name,
      payload,
      jobId,
      code,
      message,
      failedAt: new Date().toISOString(),
    } satisfies DeadLetterEntry);
    deps.log.error("job moved to dead-letter", { name, jobId, code });
  };
}

/** Test helper — read DLQ entries (newest last). */
export async function listDeadLetterEntries(deps: {
  connection: RedisConnection;
  prefix?: string;
}): Promise<DeadLetterEntry[]> {
  const dlq = new Queue(DEAD_LETTER_QUEUE, {
    connection: toBullConnection(deps.connection),
    prefix: deps.prefix,
  });
  const jobs = await dlq.getJobs(["waiting", "completed"], 0, 100);
  return jobs.map((j) => j.data as DeadLetterEntry);
}
