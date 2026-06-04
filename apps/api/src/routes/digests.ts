import { Router } from "express";
import { makeContainerAuthMiddleware } from "../middleware/auth-factory.js";
import type { Container } from "../composition-root.js";

export function makeDigestsRouter(container: Container): Router {
  const router = Router();
  const auth = makeContainerAuthMiddleware(container);

  router.get("/", auth, async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 10), 50);
      const rows = await container.repos.digests.history(req.userId!, limit);
      res.json(
        rows.map((d) => ({
          id: d.id,
          weekStart: d.weekStart.toISOString(),
          weekEnd: d.weekEnd.toISOString(),
          subject: d.subject,
          totalSpend: d.facts.totalSpend,
          deliveredAt: d.deliveredAt?.toISOString() ?? null,
        })),
      );
    } catch (err) {
      next(err);
    }
  });

  return router;
}
