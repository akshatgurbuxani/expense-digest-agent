import { describe, it, expect } from "vitest";
import request from "supertest";
import { aUser, type TestRepositories } from "@expense/core/testing";
import { makeTestConfig } from "@expense/config/testing";
import { buildWorkerContainer } from "@expense/workers/composition-root";
import { createApp } from "../src/create-app.js";
import { registerJobHandlers } from "@expense/workers/job-handlers";
import { makeInMemoryJobQueue } from "@expense/core/testing";
import {
  buildGmailPushRequestBody,
  buildGmailReceiptE2eMail,
  GMAIL_RECEIPT_E2E_CLOCK,
  GMAIL_RECEIPT_E2E_ISO_WEEK,
  gmailReceiptScenario,
  seedGmailReceiptE2e,
} from "./helpers/receipt-e2e-fixture.js";

describe("gmail → digest heartbeat (in-memory)", () => {
  it("POST /webhooks/gmail links receipt to charge and digest facts include match", async () => {
    const scenario = gmailReceiptScenario("amazon-happy-path");
    const user = aUser({ timezone: "UTC" });
    const mail = buildGmailReceiptE2eMail(scenario);

    const container = buildWorkerContainer({
      config: makeTestConfig(),
      mail,
      clock: GMAIL_RECEIPT_E2E_CLOCK,
    });
    registerJobHandlers(container.consumer, container.services);

    const repos = container.repos as TestRepositories;
    const queue = container.producer as ReturnType<typeof makeInMemoryJobQueue>;
    const { transactionId } = await seedGmailReceiptE2e({
      repos,
      user,
      scenario,
    });

    const app = createApp(container);

    await request(app)
      .post("/webhooks/gmail")
      .set("Content-Type", "application/json")
      .send(buildGmailPushRequestBody())
      .expect(200);

    expect(queue.jobs.some((j) => j.name === "mail.sync")).toBe(true);

    await container.drain!(container.log);

    expect(queue.jobs.some((j) => j.name === "receipt.parse")).toBe(true);
    expect(queue.jobs.some((j) => j.name === "receipt.match")).toBe(true);

    const link = await repos.transactionReceiptLinks.findByTransactionId(
      user.id,
      transactionId!,
    );
    expect(link).not.toBeNull();

    GMAIL_RECEIPT_E2E_CLOCK.advance(60_000);

    await container.producer.enqueue("digest.generate", {
      userId: user.id,
      isoWeek: GMAIL_RECEIPT_E2E_ISO_WEEK,
    });
    await container.drain!(container.log);

    const digests = await repos.digests.history(user.id, 5);
    expect(digests).toHaveLength(1);
    expect(digests[0]?.facts.matchedReceipts).toHaveLength(1);
    expect(digests[0]?.facts.matchedReceipts[0]?.merchantName.toLowerCase()).toContain(
      "amazon",
    );
    expect(digests[0]?.facts.matchedReceipts[0]?.receiptAmount).toBe("$45.99");
    expect(digests[0]?.content).toContain("RECEIPTS MATCHED TO CHARGES");
    expect(digests[0]?.deliveredAt).not.toBeNull();
    expect(container.emailChannel!.sent[0]?.body).toContain(
      "RECEIPTS MATCHED TO CHARGES",
    );
  });

  it("leaves amount-mismatch receipts in digest unmatched facts", async () => {
    const scenario = gmailReceiptScenario("amount-mismatch-no-link");
    const user = aUser({ timezone: "UTC" });
    const mail = buildGmailReceiptE2eMail(scenario);

    const container = buildWorkerContainer({
      config: makeTestConfig(),
      mail,
      clock: GMAIL_RECEIPT_E2E_CLOCK,
    });
    registerJobHandlers(container.consumer, container.services);

    const repos = container.repos as TestRepositories;
    const { transactionId } = await seedGmailReceiptE2e({
      repos,
      user,
      scenario,
    });

    const app = createApp(container);
    await request(app)
      .post("/webhooks/gmail")
      .set("Content-Type", "application/json")
      .send(buildGmailPushRequestBody())
      .expect(200);

    await container.drain!(container.log);

    expect(
      await repos.transactionReceiptLinks.findByTransactionId(
        user.id,
        transactionId!,
      ),
    ).toBeNull();

    GMAIL_RECEIPT_E2E_CLOCK.advance(60_000);

    await container.producer.enqueue("digest.generate", {
      userId: user.id,
      isoWeek: GMAIL_RECEIPT_E2E_ISO_WEEK,
    });
    await container.drain!(container.log);

    const digest = (await repos.digests.history(user.id, 1))[0]!;
    expect(digest.facts.matchedReceipts).toHaveLength(0);
    expect(digest.facts.unmatchedReceipts.length).toBeGreaterThanOrEqual(1);
    expect(digest.content).toContain("does not align with any nearby charge");
  });
});
