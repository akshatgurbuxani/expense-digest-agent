import { Router } from "express";
import { NotFoundError } from "@expense/core";
import type { Container } from "../composition-root.js";
import { makeContainerAuthTokens } from "../middleware/auth-factory.js";

export function makeAuthRouter(container: Container): Router {
  const router = Router();
  const tokens = makeContainerAuthTokens(container);

  /** Dev/test helper — mint a session token for an existing user id. */
  router.post("/token", async (req, res, next) => {
    try {
      if (container.env.NODE_ENV === "production") {
        throw new NotFoundError("not found");
      }
      const userId = req.body?.userId as string | undefined;
      if (!userId) throw new NotFoundError("userId required");
      const user = await container.repos.users.findById(userId as never);
      if (!user) throw new NotFoundError(`user ${userId}`);
      const token = await tokens.mint(user.id);
      res.json({ token });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
