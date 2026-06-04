import type { RequestHandler } from "express";
import type { UserId } from "@expense/core";
import { ValidationError } from "@expense/core";
import type { AuthTokenService } from "@expense/config";

declare module "express-serve-static-core" {
  interface Request {
    userId?: UserId;
  }
}

export function makeAuthMiddleware(tokens: AuthTokenService): RequestHandler {
  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        throw new ValidationError("missing bearer token");
      }
      req.userId = await tokens.verify(header.slice("Bearer ".length));
      next();
    } catch (err) {
      next(err);
    }
  };
}
