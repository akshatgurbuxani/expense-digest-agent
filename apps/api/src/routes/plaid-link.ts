import { Router } from "express";
import { NotFoundError } from "@expense/core";
import type { Container } from "../composition-root.js";
import { makeContainerAuthMiddleware } from "../middleware/auth-factory.js";

export function makePlaidLinkRouter(container: Container): Router {
  const router = Router();
  const auth = makeContainerAuthMiddleware(container);

  router.post("/link-token", auth, async (req, res, next) => {
    try {
      const result = await container.bank.createLinkToken(req.userId!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/exchange", auth, async (req, res, next) => {
    try {
      const publicToken = req.body?.publicToken as string | undefined;
      if (!publicToken) throw new NotFoundError("publicToken required");

      const exchanged = await container.bank.exchangePublicToken(publicToken);
      const item = await container.repos.items.create(
        { userId: req.userId!, plaidItemId: exchanged.plaidItemId },
        exchanged.accessToken,
      );

      await container.producer.enqueue("txn.sync", {
        userId: req.userId!,
        itemId: item.id,
      });

      res.json({ itemId: item.id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
