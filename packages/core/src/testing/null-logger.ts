import type { Logger } from "../ports/logger.js";

/** No-op logger for tests that do not care about log output. */
export function makeNullLogger(): Logger {
  const base: Logger = {
    child: () => base,
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  return base;
}

/** Records every log line for assertions. */
export function makeCapturingLogger(): Logger & {
  readonly lines: Array<{ level: string; msg: string; fields?: Record<string, unknown> }>;
} {
  const lines: Array<{
    level: string;
    msg: string;
    fields?: Record<string, unknown>;
  }> = [];

  const make = (bindings: Record<string, unknown> = {}): Logger & {
    lines: typeof lines;
  } => ({
    lines,
    child: (b) => make({ ...bindings, ...b }),
    debug: (msg, fields) =>
      lines.push({ level: "debug", msg, fields: { ...bindings, ...fields } }),
    info: (msg, fields) =>
      lines.push({ level: "info", msg, fields: { ...bindings, ...fields } }),
    warn: (msg, fields) =>
      lines.push({ level: "warn", msg, fields: { ...bindings, ...fields } }),
    error: (msg, fields) =>
      lines.push({ level: "error", msg, fields: { ...bindings, ...fields } }),
  });

  return make();
}
