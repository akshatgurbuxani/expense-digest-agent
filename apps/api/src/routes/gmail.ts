import { Router, type Request, type Response, type NextFunction } from "express";
import { InvariantError, NotFoundError, ValidationError } from "@expense/core";
import type { Container } from "../composition-root.js";
import { makeContainerAuthMiddleware } from "../middleware/auth-factory.js";
import { verifyOAuthState } from "@expense/gmail";
import { defaultWebReturnUrl } from "./setup.js";

const DEFAULT_WEB_SUCCESS = "/";

export function makeGmailRouter(container: Container): Router {
  const router = Router();
  const auth = makeContainerAuthMiddleware(container);

  function gmailAuthHandler(respond: (res: Response, url: string) => void) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.userId!;
        const existing = await container.repos.mailAccounts.findByUserId(userId);
        const forceConsent =
          !existing ||
          existing.status === "needs_reauth" ||
          req.query.force === "true";

        const redirectUri =
          container.env.GOOGLE_OAUTH_REDIRECT_URI ||
          `${req.protocol}://${req.get("host")}/api/gmail/callback`;

        const returnTo =
          (req.query.returnTo as string | undefined) ??
          defaultWebReturnUrl(container);

        const { url } = await container.mail.createAuthUrl({
          userId,
          redirectUri,
          forceConsent,
          returnTo,
        });
        respond(res, url);
      } catch (err) {
        next(err);
      }
    };
  }

  router.get("/connect", auth, gmailAuthHandler((res, url) => res.redirect(url)));
  router.get("/authorize", auth, gmailAuthHandler((res, url) => res.json({ url })));

  router.get("/callback", async (req, res, next) => {
    try {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;
      const oauthError = req.query.error as string | undefined;

      if (oauthError) {
        throw new ValidationError(`Google OAuth denied: ${oauthError}`);
      }
      if (!code || !state) {
        throw new ValidationError("OAuth callback missing code or state");
      }

      const oauth = await verifyOAuthState(
        state,
        container.env.AUTH_JWT_SECRET,
      );
      const userId = oauth.userId;

      const redirectUri =
        container.env.GOOGLE_OAUTH_REDIRECT_URI ||
        `${req.protocol}://${req.get("host")}/api/gmail/callback`;

      const exchanged = await container.mail.exchangeAuthCode({
        code,
        redirectUri,
      });

      const existingByAddress =
        await container.repos.mailAccounts.findByGmailAddress(
          exchanged.gmailAddress,
        );
      if (existingByAddress && existingByAddress.userId !== userId) {
        throw new InvariantError(
          "This Gmail account is already connected to another user",
        );
      }

      let account = await container.repos.mailAccounts.findByUserId(userId);
      if (account) {
        await container.repos.mailAccounts.saveRefreshToken(
          account.id,
          exchanged.refreshToken,
        );
        if (account.status !== "active") {
          await container.repos.mailAccounts.setStatus(account.id, "active");
        }
      } else if (existingByAddress) {
        account = existingByAddress;
        await container.repos.mailAccounts.saveRefreshToken(
          account.id,
          exchanged.refreshToken,
        );
        await container.repos.mailAccounts.setStatus(account.id, "active");
      } else {
        account = await container.repos.mailAccounts.create(
          { userId, gmailAddress: exchanged.gmailAddress },
          exchanged.refreshToken,
        );
      }

      const topicName = container.env.GMAIL_PUBSUB_TOPIC;
      if (!topicName) {
        throw new ValidationError("GMAIL_PUBSUB_TOPIC is not configured");
      }

      const watch = await container.repos.mailAccounts.withRefreshToken(
        account.id,
        (refreshToken) =>
          container.mail.watchMailbox({
            refreshToken,
            topicName,
            labelIds: ["INBOX"],
            labelFilterBehavior: "INCLUDE",
          }),
      );

      await container.repos.mailAccounts.saveWatchExpiration(
        account.id,
        watch.expiration,
        watch.historyId,
      );

      await container.producer.enqueue(
        "mail.sync",
        { userId, mailAccountId: account.id },
        { jobId: `mail.sync:${account.id}` },
      );

      const successUrl =
        oauth.returnTo ??
        (req.query.returnTo as string | undefined) ??
        defaultWebReturnUrl(container) ??
        DEFAULT_WEB_SUCCESS;
      res.redirect(successUrl);
    } catch (err) {
      next(err);
    }
  });

  router.get("/status", auth, async (req, res, next) => {
    try {
      const account = await container.repos.mailAccounts.findByUserId(
        req.userId!,
      );
      if (!account || account.status === "revoked") {
        res.json({
          connected: false,
          gmailAddress: null,
          status: null,
          needsReauth: false,
        });
        return;
      }

      res.json({
        connected: account.status === "active",
        gmailAddress: account.gmailAddress,
        status: account.status,
        needsReauth: account.status === "needs_reauth",
        watchExpiresAt: account.watchExpiresAt?.toISOString() ?? null,
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/disconnect", auth, async (req, res, next) => {
    try {
      const account = await container.repos.mailAccounts.findByUserId(
        req.userId!,
      );
      if (!account) {
        throw new NotFoundError("Gmail is not connected");
      }

      await container.repos.mailAccounts.withRefreshToken(
        account.id,
        async (refreshToken) => {
          await container.mail.stopMailbox({ refreshToken });
          await container.mail.revokeAccess({ refreshToken });
        },
      );

      await container.repos.mailAccounts.setStatus(account.id, "revoked");
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
