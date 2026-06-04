import { AppError } from "@expense/core";
import type {
  JobContext,
  JobHandler,
  JobName,
  JobPayload,
  Logger,
} from "@expense/core";
import type { Job } from "bullmq";
import type { MoveToDeadLetter } from "./dead-letter.js";
import { validateJobPayload } from "./jobs.js";
import type { QueueSettings } from "./settings.js";

/**
 * The single job wrapper — retry vs dead-letter decided only from AppError.retryable.
 * Adds structured logging with correlation IDs (userId, jobType, jobId) for traceability.
 * See docs/error-handling.md §1.
 */
export async function runHandler<K extends JobName>(
  name: K,
  rawPayload: unknown,
  job: Job,
  handler: JobHandler<K>,
  log: Logger,
  moveToDeadLetter: MoveToDeadLetter,
  settings: QueueSettings,
): Promise<void> {
  const startTime = Date.now();
  let payload: JobPayload<K>;
  
  try {
    payload = validateJobPayload(name, rawPayload);
  } catch (err) {
    await handleJobFailure(
      name,
      rawPayload,
      job,
      err,
      log,
      moveToDeadLetter,
      settings,
    );
    return;
  }

  // Extract userId from payload for correlation (validated on every job schema)
  const userId = (payload as { userId: string }).userId;
  const scopedLog = log.child({
    jobType: name,
    jobId: job.id ?? `${name}-${Date.now()}`,
    userId,
    attempt: job.attemptsMade + 1,
  });

  scopedLog.info("job started");

  const ctx: JobContext = {
    jobId: job.id ?? name,
    attempt: job.attemptsMade + 1,
    log: scopedLog,
  };

  try {
    await handler(payload, ctx);
    const duration = Date.now() - startTime;
    scopedLog.info("job completed", { durationMs: duration });
  } catch (err) {
    const duration = Date.now() - startTime;
    scopedLog.error("job failed", { durationMs: duration });
    await handleJobFailure(name, payload, job, err, scopedLog, moveToDeadLetter, settings);
  }
}

async function handleJobFailure(
  name: JobName,
  payloadForDlq: unknown,
  job: Job,
  err: unknown,
  log: Logger,
  moveToDeadLetter: MoveToDeadLetter,
  settings: QueueSettings,
): Promise<void> {
  const retryable = err instanceof AppError ? err.retryable : true;
  const code = err instanceof AppError ? err.code : "unknown";
  const errMessage = err instanceof Error ? err.message : String(err);
  
  log.error("job execution error", {
    name,
    jobId: job.id,
    errorCode: code,
    errorMessage: errMessage,
    retryable,
    attempt: job.attemptsMade + 1,
    maxAttempts: settings.maxAttempts,
  });

  if (!retryable) {
    log.warn("job marked non-retryable, moving to DLQ", { reason: "AppError.retryable=false" });
    await moveToDeadLetter(name, payloadForDlq, err, job.id);
    return;
  }

  if (job.attemptsMade + 1 >= settings.maxAttempts) {
    log.warn("job exhausted retries, moving to DLQ", {
      attempts: job.attemptsMade + 1,
      maxAttempts: settings.maxAttempts,
    });
    await moveToDeadLetter(name, payloadForDlq, err, job.id);
    return;
  }

  log.info("job will retry", {
    nextAttempt: job.attemptsMade + 2,
    maxAttempts: settings.maxAttempts,
  });
  throw err;
}
