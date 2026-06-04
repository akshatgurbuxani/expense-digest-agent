import { Router } from "express";
import { NotFoundError } from "@expense/core";
import type { Container } from "../composition-root.js";
import { makeContainerAuthMiddleware } from "../middleware/auth-factory.js";

export function makePreferencesRouter(container: Container): Router {
  const router = Router();
  const auth = makeContainerAuthMiddleware(container);

  router.get("/", auth, async (req, res, next) => {
    try {
      const user = await container.repos.users.findById(req.userId!);
      if (!user) throw new NotFoundError(`user ${req.userId}`);
      res.json({
        timezone: user.timezone,
        digestDay: user.digestDay,
        digestTime: user.digestTime,
        deliveryPreference: user.deliveryPreference,
      });
    } catch (err) {
      next(err);
    }
  });

  router.put("/", auth, async (req, res, next) => {
    try {
      await container.repos.users.updatePreferences(req.userId!, {
        timezone: req.body?.timezone,
        digestDay: req.body?.digestDay,
        digestTime: req.body?.digestTime,
        deliveryPreference: req.body?.deliveryPreference,
      });
      const user = await container.repos.users.findById(req.userId!);
      if (!user) throw new NotFoundError(`user ${req.userId}`);
      res.json({
        timezone: user.timezone,
        digestDay: user.digestDay,
        digestTime: user.digestTime,
        deliveryPreference: user.deliveryPreference,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
