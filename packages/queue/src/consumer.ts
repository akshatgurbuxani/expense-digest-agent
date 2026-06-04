import type { JobConsumer, JobHandler, JobName, Logger } from "@expense/core";
import { InvariantError } from "@expense/core";
import { Worker } from "bullmq";
import { toBullConnection, type RedisConnection } from "./connection.js";
import type { MoveToDeadLetter } from "./dead-letter.js";
import { runHandler } from "./run-handler.js";
import type { QueueSettings } from "./settings.js";

export function makeJobConsumer(deps: {
  connection: RedisConnection;
  log: Logger;
  moveToDeadLetter: MoveToDeadLetter;
  settings: QueueSettings;
}): JobConsumer {
  const { settings } = deps;
  const handlers = new Map<JobName, JobHandler<JobName>>();
  const workers: Worker[] = [];
  let started = false;

  return {
    process(name, handler) {
      if (started) {
        throw new InvariantError(`cannot register handler for ${name} after start()`);
      }
      handlers.set(name, handler as JobHandler<JobName>);
    },

    async start() {
      if (started) return;
      started = true;

      for (const [name, handler] of handlers) {
        const concurrency = settings.workerConcurrency[name];
        if (concurrency === undefined) {
          throw new InvariantError(
            `missing worker concurrency for job ${name} in queue settings`,
          );
        }

        const worker = new Worker(
          name,
          async (job) => {
            await runHandler(
              name,
              job.data,
              job,
              handler,
              deps.log,
              deps.moveToDeadLetter,
              settings,
            );
          },
          {
            connection: toBullConnection(deps.connection),
            prefix: settings.prefix,
            concurrency,
          },
        );
        workers.push(worker);
      }
    },

    async stop() {
      await Promise.all(workers.map((w) => w.close()));
      workers.length = 0;
      started = false;
    },
  };
}
