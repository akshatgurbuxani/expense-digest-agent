import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { newId } from "@expense/core";
import { FixedClock } from "@expense/core/testing";
import { makeAuthTokenService } from "@expense/config";
import { makeAuthMiddleware } from "./auth.js";
import { errorMiddleware } from "./error.js";
import { makeNullLogger } from "@expense/core/testing";

describe("makeAuthMiddleware", () => {
  it("sets req.userId from a valid bearer token", async () => {
    const clock = new FixedClock(new Date("2026-05-25T12:00:00.000Z"));
    const tokens = makeAuthTokenService({
      secret: "test-auth-secret-min-16-chars",
      clock,
    });
    const userId = newId<"UserId">();
    const token = await tokens.mint(userId);

    const app = express();
    app.get("/me", makeAuthMiddleware(tokens), (req, res) => {
      res.json({ userId: req.userId });
    });
    app.use(errorMiddleware(makeNullLogger()));

    const res = await request(app)
      .get("/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.userId).toBe(userId);
  });

  it("returns 400 when authorization header is missing", async () => {
    const tokens = makeAuthTokenService({
      secret: "test-auth-secret-min-16-chars",
      clock: new FixedClock(),
    });
    const app = express();
    app.get("/me", makeAuthMiddleware(tokens), (_req, res) => res.sendStatus(200));
    app.use(errorMiddleware(makeNullLogger()));

    await request(app).get("/me").expect(400);
  });
});
