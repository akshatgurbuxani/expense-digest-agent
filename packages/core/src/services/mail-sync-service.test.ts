import { describe, it, expect } from "vitest";
import { MailHistoryExpiredError } from "../errors.js";
import { newId } from "../ids.js";
import { makeMailSyncService } from "./mail-sync-service.js";
import { makeInMemoryRepositories } from "../testing/in-memory-repos.js";
import { makeCapturingJobProducer } from "../testing/capturing-jobs.js";
import { makeFakeMailProvider } from "../testing/fake-mail.js";
import { FixedClock } from "../testing/fixed-clock.js";
import { TEST_MAIL_CLASSIFIER_CONFIG } from "../testing/tunables.js";

describe("makeMailSyncService", () => {
  it("persists history checkpoint after processing changes", async () => {
    const repos = makeInMemoryRepositories();
    const jobs = makeCapturingJobProducer();
    const userId = newId<"UserId">();
    const account = await repos.mailAccounts.create(
      { userId, gmailAddress: "u@gmail.com" },
      "token",
    );

    const mail = makeFakeMailProvider({
      changePages: [
        {
          candidateMessageIds: ["msg-1"],
          deletedMessageIds: [],
          nextHistoryId: "500",
        },
      ],
      messages: {
        "msg-1": {
          gmailMessageId: "msg-1",
          threadId: "t1",
          receivedAt: new Date("2026-05-20T18:00:00.000Z"),
          fromAddress: "Amazon <order-update@amazon.com>",
          subject: "Your Amazon.com order has shipped",
          snippet: null,
          labelIds: ["INBOX"],
          textPlain: "Thanks",
          textHtml: null,
        },
      },
    });

    const svc = makeMailSyncService({
      mail,
      mailAccounts: repos.mailAccounts,
      mailMessages: repos.mailMessages,
      queue: jobs,
      clock: new FixedClock(new Date("2026-05-20T12:00:00.000Z")),
      classifierConfig: TEST_MAIL_CLASSIFIER_CONFIG,
    });

    await svc.run({ userId, mailAccountId: account.id });

    const updated = await repos.mailAccounts.findById(account.id);
    expect(updated?.historyId).toBe("500");
    expect(jobs.jobs.some((j) => j.name === "receipt.parse")).toBe(true);
  });

  it("enqueues mail.fullSync when history checkpoint is expired", async () => {
    const repos = makeInMemoryRepositories();
    const jobs = makeCapturingJobProducer();
    const userId = newId<"UserId">();
    const account = await repos.mailAccounts.create(
      { userId, gmailAddress: "u@gmail.com" },
      "token",
    );
    await repos.mailAccounts.saveHistoryId(
      account.id,
      "expired-1",
      new Date("2026-05-01T00:00:00.000Z"),
    );

    const mail = makeFakeMailProvider({ expiredHistoryId: "expired-1" });
    const svc = makeMailSyncService({
      mail,
      mailAccounts: repos.mailAccounts,
      mailMessages: repos.mailMessages,
      queue: jobs,
      clock: new FixedClock(new Date("2026-05-20T12:00:00.000Z")),
      classifierConfig: TEST_MAIL_CLASSIFIER_CONFIG,
    });

    await svc.run({ userId, mailAccountId: account.id });

    expect(jobs.jobs.some((j) => j.name === "mail.fullSync")).toBe(true);
    const updated = await repos.mailAccounts.findById(account.id);
    expect(updated?.historyId).toBe("expired-1");
  });
});

describe("MailHistoryExpiredError", () => {
  it("is not retryable", () => {
    expect(new MailHistoryExpiredError("x").retryable).toBe(false);
  });
});
