import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import {
  aUser,
  FixedClock,
  makeFakeMailProvider,
  makeInMemoryRepositories,
  makeCapturingJobProducer,
} from "@expense/core/testing";
import { encodeGmailPushData } from "@expense/gmail";
import { makeTestAppConfig, makeTestEnv } from "@expense/config/testing";
import { buildApiContainer } from "../composition-root.js";
import { createApp } from "../create-app.js";

describe("POST /webhooks/gmail", () => {
  const repos = makeInMemoryRepositories();
  const user = aUser();
  repos._seed.user(user);

  const mail = makeFakeMailProvider({
    gmailAddress: "shopper@gmail.com",
    push: { gmailAddress: "shopper@gmail.com", historyId: "5000" },
  });

  const jobs = makeCapturingJobProducer();
  const container = buildApiContainer({
    env: makeTestEnv(),
    app: makeTestAppConfig(),
    repos,
    clock: new FixedClock(new Date("2026-05-25T12:00:00.000Z")),
    mail,
    useBullMQ: false,
  });
  Object.assign(container, { producer: jobs });

  beforeEach(async () => {
    jobs.jobs.length = 0;
    jobs.jobIds.clear();
    await repos.mailAccounts.create(
      { userId: user.id, gmailAddress: "shopper@gmail.com" },
      "refresh-token",
    );
  });

  it("verifies push payload and enqueues coalesced mail.sync", async () => {
    const data = encodeGmailPushData({
      emailAddress: "shopper@gmail.com",
      historyId: "5000",
    });
    const body = JSON.stringify({ message: { data } });

    const app = createApp(container);
    await request(app)
      .post("/webhooks/gmail")
      .set("Content-Type", "application/json")
      .send(body)
      .expect(200);

    expect(jobs.jobs).toHaveLength(1);
    expect(jobs.jobs[0]?.name).toBe("mail.sync");
    expect(jobs.jobs[0]?.opts?.jobId).toMatch(/^mail\.sync:/);
  });

  it("returns 404 when gmail address is unknown", async () => {
    const mailUnknown = makeFakeMailProvider({
      gmailAddress: "unknown@gmail.com",
    });
    const unknownJobs = makeCapturingJobProducer();
    const unknownContainer = buildApiContainer({
      env: makeTestEnv(),
      app: makeTestAppConfig(),
      repos,
      clock: new FixedClock(new Date("2026-05-25T12:00:00.000Z")),
      mail: mailUnknown,
      useBullMQ: false,
    });
    Object.assign(unknownContainer, { producer: unknownJobs });

    const data = encodeGmailPushData({
      emailAddress: "unknown@gmail.com",
      historyId: "1",
    });
    const body = JSON.stringify({ message: { data } });

    const app = createApp(unknownContainer);
    await request(app)
      .post("/webhooks/gmail")
      .set("Content-Type", "application/json")
      .send(body)
      .expect(404);
  });
});
