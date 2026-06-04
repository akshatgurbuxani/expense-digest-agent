import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { newId, type DigestId } from "@expense/core";
import {
  aUser,
  FixedClock,
  makeInMemoryRepositories,
  type TestRepositories,
} from "@expense/core/testing";
import { makeAuthTokenService } from "@expense/config";
import { makeTestAppConfig, makeTestEnv } from "@expense/config/testing";
import { buildApiContainer } from "../composition-root.js";
import { createApp } from "../create-app.js";
import { makeContainerAuthTokens } from "../middleware/auth-factory.js";

describe("REST API routes", () => {
  const clock = new FixedClock(new Date("2026-05-25T12:00:00.000Z"));
  const repos = makeInMemoryRepositories();
  const user = aUser();
  repos._seed.user(user);

  const container = buildApiContainer({
    env: makeTestEnv(),
    app: makeTestAppConfig(),
    repos,
    clock,
  });
  const tokens = makeContainerAuthTokens(container);

  let token = "";

  beforeEach(async () => {
    token = await tokens.mint(user.id);
  });

  it("GET /api/preferences returns the authenticated user's prefs", async () => {
    const app = createApp(container);
    const res = await request(app)
      .get("/api/preferences")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.timezone).toBe(user.timezone);
    expect(res.body.deliveryPreference).toBe("email");
  });

  it("PUT /api/preferences updates prefs for the authenticated user only", async () => {
    const app = createApp(container);
    await request(app)
      .put("/api/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ digestTime: "09:30", deliveryPreference: "sms" })
      .expect(200);

    const updated = await repos.users.findById(user.id);
    expect(updated?.digestTime).toBe("09:30");
    expect(updated?.deliveryPreference).toBe("sms");
  });

  it("GET /api/digests returns only the authenticated user's history", async () => {
    const other = aUser({ email: "other@example.com" });
    (repos as TestRepositories)._seed.user(other);

    await repos.digests.create({
      id: newId<"DigestId">(),
      userId: user.id,
      weekStart: new Date("2026-05-18T00:00:00.000Z"),
      weekEnd: new Date("2026-05-25T00:00:00.000Z"),
      facts: {
        user: { firstName: "Alex", currency: "USD" },
        window: { startLabel: "May 18", endLabel: "May 25" },
        totalSpend: "$10.00",
        totalSpendVsBaseline: null,
        categories: [],
        anomalies: [],
        matchedReceipts: [],
        unmatchedReceipts: [],
        chargesMissingReceipts: [],
        maturity: "learning",
      },
      subject: "Your week",
      content: "Spent $10.00",
      deliveredAt: new Date(),
    });

    const app = createApp(container);
    const res = await request(app)
      .get("/api/digests")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]?.totalSpend).toBe("$10.00");
  });

  it("POST /api/plaid/link-token returns a link token", async () => {
    const app = createApp(container);
    const res = await request(app)
      .post("/api/plaid/link-token")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.linkToken.length).toBeGreaterThan(0);
  });
});
