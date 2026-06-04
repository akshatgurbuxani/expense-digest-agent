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

describe("Gmail OAuth routes", () => {
  const clock = new FixedClock(new Date("2026-05-25T12:00:00.000Z"));
  const repos = makeInMemoryRepositories();
  const user = aUser();
  repos._seed.user(user);

  const mail = makeFakeMailProvider({
    gmailAddress: "user@gmail.com",
    refreshToken: "refresh-test",
  });

  const container = buildApiContainer({
    env: makeTestEnv({
      GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/gmail/callback",
      GMAIL_PUBSUB_TOPIC: "projects/test/topics/gmail-push",
    }),
    app: makeTestAppConfig(),
    repos,
    clock,
    mail,
  });
  const tokens = makeContainerAuthTokens(container);

  let token = "";

  beforeEach(async () => {
    token = await tokens.mint(user.id);
  });

  it("GET /api/gmail/status reports disconnected when no account", async () => {
    const app = createApp(container);
    const res = await request(app)
      .get("/api/gmail/status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.connected).toBe(false);
  });

  it("GET /api/gmail/connect redirects to Google OAuth", async () => {
    const app = createApp(container);
    const res = await request(app)
      .get("/api/gmail/connect")
      .set("Authorization", `Bearer ${token}`)
      .expect(302);

    expect(res.headers.location).toContain("access_type=offline");
    expect(res.headers.location).toContain("prompt=consent");
  });

  it("GET /api/gmail/authorize returns a JSON OAuth URL for the SPA", async () => {
    const app = createApp(container);
    const res = await request(app)
      .get("/api/gmail/authorize?returnTo=http://localhost:5173")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.url).toContain("access_type=offline");
    expect(res.body.url).toContain("prompt=consent");
  });
});
