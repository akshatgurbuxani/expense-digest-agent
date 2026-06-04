import {
  AppError,
  NotFoundError,
  UpstreamError,
  ValidationError,
} from "@expense/core";
import type { Logger } from "@expense/core";
import type { ErrorRequestHandler, RequestHandler } from "express";

export function errorMiddleware(log: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    const status =
      err instanceof ValidationError
        ? 400
        : err instanceof NotFoundError
          ? 404
          : err instanceof UpstreamError
            ? 502
            : 500;

    const code = err instanceof AppError ? err.code : "internal";
    log.error("request failed", { code, status, err: String(err) });
    res.status(status).json({
      error: {
        code,
        message: err instanceof Error ? err.message : "internal error",
      },
    });
  };
}

/** Normalize Express headers to a plain string map for port adapters. */
export function headerMap(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return out;
}

export function asyncHandler(
  fn: RequestHandler,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
