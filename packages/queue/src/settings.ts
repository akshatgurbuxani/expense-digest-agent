import type { JobName } from "@expense/core";

export interface QueueSettings {
  readonly prefix: string;
  readonly maxAttempts: number;
  readonly backoff: {
    readonly type: "exponential" | "fixed";
    readonly delayMs: number;
  };
  readonly workerConcurrency: Record<JobName, number>;
}
