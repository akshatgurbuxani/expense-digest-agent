import type { AuthTokenService } from "@expense/config";
import { makeAuthTokenService } from "@expense/config";
import type { Container } from "../composition-root.js";
import { makeAuthMiddleware } from "./auth.js";

export function makeContainerAuthTokens(container: Container): AuthTokenService {
  return makeAuthTokenService({
    secret: container.env.AUTH_JWT_SECRET,
    clock: container.clock,
  });
}

export function makeContainerAuthMiddleware(container: Container) {
  return makeAuthMiddleware(makeContainerAuthTokens(container));
}
