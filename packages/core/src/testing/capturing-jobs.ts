import type {
  EnqueueOptions,
  JobName,
  JobPayload,
  JobProducer,
} from "../ports/jobs.js";

export interface EnqueuedJob<K extends JobName = JobName> {
  readonly name: K;
  readonly payload: JobPayload<K>;
  readonly opts?: EnqueueOptions;
}

/** In-memory JobProducer that records every enqueue for assertions. */
export function makeCapturingJobProducer(): JobProducer & {
  readonly jobs: EnqueuedJob[];
  readonly jobIds: Set<string>;
} {
  const jobs: EnqueuedJob[] = [];
  const jobIds = new Set<string>();

  return {
    jobs,
    jobIds,
    async enqueue(name, payload, opts) {
      if (opts?.jobId) {
        if (jobIds.has(opts.jobId)) return; // idempotent no-op like BullMQ
        jobIds.add(opts.jobId);
      }
      jobs.push({ name, payload, opts } as EnqueuedJob);
    },
  };
}
