import pino, { type Logger as PinoLogger } from "pino";
import type { Logger } from "@expense/core";

/** The production Logger: a thin structured wrapper over pino. */
export function makeLogger(opts: { level?: string; pretty?: boolean } = {}): Logger {
  const pinoOpts: pino.LoggerOptions = {
    level: opts.level ?? "info",
    // Production: JSON lines for structured log aggregation
    // Dev with pretty=true: human-readable format
    ...(opts.pretty
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss.l",
              ignore: "pid,hostname",
              messageFormat: "{levelLabel} [{userId}] [{jobType}:{jobId}] {msg}",
            },
          },
        }
      : {
          // Production: add standard fields for observability
          base: {
            env: process.env.NODE_ENV ?? "development",
            service: process.env.SERVICE_NAME,
          },
          timestamp: pino.stdTimeFunctions.isoTime,
        }),
  };

  return wrap(pino(pinoOpts));
}

/** Logger that writes to stderr — required for stdio MCP servers. */
export function makeStderrLogger(opts: { level?: string } = {}): Logger {
  return wrap(
    pino(
      {
        level: opts.level ?? "info",
        base: undefined, // MCP stderr should be minimal
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      pino.destination(2),
    ),
  );
}

function wrap(p: PinoLogger): Logger {
  return {
    child: (bindings) => wrap(p.child(bindings)),
    debug: (msg, fields) => p.debug(fields ?? {}, msg),
    info: (msg, fields) => p.info(fields ?? {}, msg),
    warn: (msg, fields) => p.warn(fields ?? {}, msg),
    error: (msg, fields) => p.error(fields ?? {}, msg),
  };
}
