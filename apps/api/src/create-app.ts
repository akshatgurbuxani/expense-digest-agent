import express from "express";
import type { Container } from "./composition-root.js";
import { errorMiddleware } from "./middleware/error.js";
import { makeWebhookRouter } from "./routes/webhooks.js";
import { makeAuthRouter } from "./routes/auth.js";
import { makePlaidLinkRouter } from "./routes/plaid-link.js";
import { makeGmailRouter } from "./routes/gmail.js";
import { makePreferencesRouter } from "./routes/preferences.js";
import { makeDigestsRouter } from "./routes/digests.js";
import { makeSetupRouter } from "./routes/setup.js";

export function createApp(container: Container): express.Application {
  const app = express();

  if (container.env.CORS_ORIGINS) {
    app.use((req, res, next) => {
      const origins = container.env.CORS_ORIGINS.split(",").map((o) => o.trim());
      const origin = req.headers.origin;
      if (origin && origins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
        res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
      }
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
    });
  }

  app.use("/webhooks", makeWebhookRouter(container));
  app.use(express.json());
  app.use("/api/auth", makeAuthRouter(container));
  app.use("/api/plaid", makePlaidLinkRouter(container));
  app.use("/api/gmail", makeGmailRouter(container));
  app.use("/api/preferences", makePreferencesRouter(container));
  app.use("/api/digests", makeDigestsRouter(container));
  app.use("/api/setup", makeSetupRouter(container));
  app.use(errorMiddleware(container.log));
  return app;
}
