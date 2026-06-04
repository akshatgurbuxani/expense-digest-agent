import { Router } from "express";
import type { Container } from "../composition-root.js";
import { makeContainerAuthMiddleware } from "../middleware/auth-factory.js";

function defaultWebReturnUrl(container: Container): string {
  const origin = container.env.CORS_ORIGINS.split(",")
    .map((value) => value.trim())
    .find(Boolean);
  return origin ?? "/";
}

export function makeSetupRouter(container: Container): Router {
  const router = Router();
  const auth = makeContainerAuthMiddleware(container);

  router.get("/status", auth, async (req, res, next) => {
    try {
      const userId = req.userId!;
      const [items, mailAccount] = await Promise.all([
        container.repos.items.listByUserId(userId),
        container.repos.mailAccounts.findByUserId(userId),
      ]);

      const bankConnected = items.some((item) => item.status !== "error");
      const gmailConnected =
        mailAccount != null &&
        mailAccount.status !== "revoked" &&
        mailAccount.status === "active";

      res.json({
        bank: {
          connected: bankConnected,
          itemCount: items.length,
        },
        gmail: {
          connected: gmailConnected,
          gmailAddress:
            mailAccount && mailAccount.status !== "revoked"
              ? mailAccount.gmailAddress
              : null,
          needsReauth: mailAccount?.status === "needs_reauth",
        },
        complete: bankConnected && gmailConnected,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export { defaultWebReturnUrl };
