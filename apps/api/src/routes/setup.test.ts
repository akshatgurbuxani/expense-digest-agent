import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import {
  aUser,
  FixedClock,
  makeFakeMailProvider,
  makeInMemoryRepositories,
} from "@expense/core/testing";
import { makeTestAppConfig, makeTestEnv } from "@expense/config/testing";
import { buildApiContainer } from "../composition-root.js";
import { createApp } from "../create-app.js";
import { makeContainerAuthTokens } from "../middleware/auth-factory.js";

describe("GET /api/setup/status", () => {
  const clock = new FixedClock(new Date("2026-05-25T12:00:00.000Z"));
  const repos = makeInMemoryRepositories();
  const user = aUser();
  repos._seed.user(user);

  const container = buildApiContainer({
    env: makeTestEnv({
      CORS_ORIGINS: "http://localhost:5173",
      GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/gmail/callback",
      GMAIL_PUBSUB_TOPIC: "projects/test/topics/gmail-push",
    }),
    app: makeTestAppConfig(),
    repos,
    clock,
    mail: makeFakeMailProvider({
      gmailAddress: "user@gmail.com",
      refreshToken: "refresh-test",
    }),
  });
  const tokens = makeContainerAuthTokens(container);

  let token = "";

  beforeEach(async () => {
    token = await tokens.mint(user.id);
  });

  it("reports incomplete setup when bank and Gmail are missing", async () => {
    const app = createApp(container);
    const res = await request(app)
      .get("/api/setup/status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({
      bank: { connected: false, itemCount: 0 },
      gmail: {
        connected: false,
        gmailAddress: null,
        needsReauth: false,
      },
      complete: false,
    });
  });

  it("reports complete when bank and Gmail are connected", async () => {
    await repos.items.create(
      { userId: user.id, plaidItemId: "plaid-item-setup" },
      "access-token",
    );
    await repos.mailAccounts.create(
      { userId: user.id, gmailAddress: "user@gmail.com" },
      "refresh-token",
    );

    const app = createApp(container);
    const res = await request(app)
      .get("/api/setup/status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.complete).toBe(true);
    expect(res.body.bank.connected).toBe(true);
    expect(res.body.gmail.connected).toBe(true);
    expect(res.body.gmail.gmailAddress).toBe("user@gmail.com");
  });
});
