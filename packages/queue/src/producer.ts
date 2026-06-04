import type { JobName, JobProducer, Logger } from "@expense/core";
import { InvariantError } from "@expense/core";
import { Queue } from "bullmq";
import { toBullConnection, type RedisConnection } from "./connection.js";
import type { QueueSettings } from "./settings.js";
import { validateJobPayload } from "./jobs.js";
import { toBullJobId } from "./job-id.js";

export function makeJobProducer(deps: {
  connection: RedisConnection;
  log: Logger;
  settings: QueueSettings;
}): JobProducer {
  const { settings } = deps;
  const queues = new Map<JobName, Queue>();

  function queueFor(name: JobName): Queue {
    let q = queues.get(name);
    if (!q) {
      q = new Queue(name, {
        connection: toBullConnection(deps.connection),
        prefix: settings.prefix,
      });
      queues.set(name, q);
    }
    return q;
  }

  return {
    async enqueue(name, payload, opts) {
      validateJobPayload(name, payload);
      const queue = queueFor(name);
      await queue.add(name, payload, {
        jobId: opts?.jobId ? toBullJobId(opts.jobId) : undefined,
        delay: opts?.delayMs,
        attempts: settings.maxAttempts,
        backoff: {
          type: settings.backoff.type,
          delay: settings.backoff.delayMs,
        },
      });
      deps.log.debug("job enqueued", { name, jobId: opts?.jobId });
    },
  };
}

/** Test helper — count waiting + active + delayed jobs for a queue. */
export async function countPendingJobs(deps: {
  connection: RedisConnection;
  name: JobName;
  prefix: string;
}): Promise<number> {
  const queue = new Queue(deps.name, {
    connection: toBullConnection(deps.connection),
    prefix: deps.prefix,
  });
  const counts = await queue.getJobCounts("waiting", "active", "delayed");
  return (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
}
