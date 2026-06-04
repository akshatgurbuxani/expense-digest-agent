/**
 * Structured logging. No string interpolation of data into the message —
 * pass data as `fields`. Workers create a `child({ jobId, userId })` so every
 * line is traceable to a tenant and a job.
 */
export interface Logger {
  child(bindings: Record<string, unknown>): Logger;
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}
