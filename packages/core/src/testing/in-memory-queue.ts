import { InvariantError } from "../errors.js";
import type {
  JobConsumer,
  JobContext,
  JobHandler,
  JobName,
  JobProducer,
} from "../ports/jobs.js";
import type { Logger } from "../ports/logger.js";
import type { EnqueuedJob } from "./capturing-jobs.js";
import { makeNullLogger } from "./null-logger.js";

/** Synchronous in-process queue for tests and the Phase-6 vertical slice. */
export function makeInMemoryJobQueue(queueLog?: Logger): JobProducer &
  JobConsumer & {
    readonly jobs: EnqueuedJob[];
    drain(log?: Logger): Promise<void>;
  } {
  const jobs: EnqueuedJob[] = [];
  const jobIds = new Set<string>();
  const handlers = new Map<JobName, JobHandler<JobName>>();
  const defaultLog = queueLog ?? makeNullLogger();

  return {
    jobs,

    async enqueue(name, payload, opts) {
      if (opts?.jobId) {
        if (jobIds.has(opts.jobId)) {
          defaultLog.debug(`📥 Duplicate job skipped: ${name}`, { jobId: opts.jobId });
          return;
        }
        jobIds.add(opts.jobId);
      }
      defaultLog.info(`📥 Job enqueued: ${name}`, { jobId: opts?.jobId, payload });
      jobs.push({ name, payload, opts } as EnqueuedJob);
    },

    process(name, handler) {
      handlers.set(name, handler as JobHandler<JobName>);
    },

    async start() {
      /* BullMQ pulls in Phase 8; in-memory jobs are drained explicitly. */
    },

    async stop() {
      /* no-op for in-memory queue */
    },

    async drain(log = defaultLog) {
      let processed = 0;
      while (processed < jobs.length) {
        const job = jobs[processed]!;
        processed += 1;
        const handler = handlers.get(job.name);
        if (!handler) {
          throw new InvariantError(`no handler registered for job ${job.name}`);
        }
        const ctx: JobContext = {
          jobId: job.opts?.jobId ?? `${job.name}-${processed}`,
          attempt: 1,
          log,
        };
        log.info(`🔄 Processing job ${processed}/${jobs.length}`, { 
          jobName: job.name, 
          jobId: ctx.jobId,
          payload: job.payload,
        });
        await handler(job.payload, ctx);
        log.info(`✅ Completed job ${processed}/${jobs.length}`, { 
          jobName: job.name, 
          jobId: ctx.jobId,
        });
      }
      log.info(`🏁 Drained ${processed} jobs`);
    },
  };
}
