import express, { Router } from "express";
import { NotFoundError } from "@expense/core";
import type { Container } from "../composition-root.js";
import { asyncHandler, headerMap } from "../middleware/error.js";

export function makeWebhookRouter(container: Container): Router {
  const router = Router();

  router.post(
    "/plaid",
    express.raw({ type: "application/json" }),
    asyncHandler(async (req, res) => {
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(JSON.stringify(req.body ?? {}));

      const verified = await container.bank.verifyWebhook(
        headerMap(req.headers),
        rawBody,
      );

      const item = await container.repos.items.findByPlaidItemId(verified.itemId);
      if (!item) {
        throw new NotFoundError(`item for plaid id ${verified.itemId}`);
      }

      await container.producer.enqueue(
        "txn.sync",
        { userId: item.userId, itemId: item.id },
        { jobId: `txn.sync:${item.id}` },
      );

      res.status(200).json({ ok: true });
    }),
  );

  router.post(
    "/gmail",
    express.raw({ type: "application/json" }),
    asyncHandler(async (req, res) => {
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(JSON.stringify(req.body ?? {}));

      const verified = await container.mail.verifyPushNotification(
        headerMap(req.headers),
        rawBody,
      );

      const account = await container.repos.mailAccounts.findByGmailAddress(
        verified.gmailAddress,
      );
      if (!account) {
        throw new NotFoundError(
          `mail account for ${verified.gmailAddress}`,
        );
      }

      await container.producer.enqueue(
        "mail.sync",
        { userId: account.userId, mailAccountId: account.id },
        { jobId: `mail.sync:${account.id}` },
      );

      res.status(200).json({ ok: true });
    }),
  );

  return router;
}
