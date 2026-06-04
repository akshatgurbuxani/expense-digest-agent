import { describe, it, expect } from "vitest";
import { newId } from "../ids.js";
import { ingestGmailMessage } from "./mail-ingest.js";
import { makeInMemoryRepositories } from "../testing/in-memory-repos.js";
import { makeCapturingJobProducer } from "../testing/capturing-jobs.js";
import { makeFakeMailProvider } from "../testing/fake-mail.js";
import { TEST_MAIL_CLASSIFIER_CONFIG } from "../testing/tunables.js";

const amazonMeta = {
  gmailMessageId: "gmail-ingest-1",
  threadId: "thread-1",
  receivedAt: new Date("2026-05-20T18:00:00.000Z"),
  fromAddress: "Amazon <order-update@amazon.com>",
  subject: "Your Amazon.com order has shipped",
  snippet: null,
  labelIds: ["INBOX"] as const,
  textPlain: "Order total: $45.99",
  textHtml: null,
};

function makeIngestDeps(
  messages: Record<string, typeof amazonMeta>,
) {
  const repos = makeInMemoryRepositories();
  const jobs = makeCapturingJobProducer();
  const mail = makeFakeMailProvider({ messages });
  return {
    repos,
    jobs,
    deps: {
      mail,
      mailMessages: repos.mailMessages,
      queue: jobs,
      classifierConfig: TEST_MAIL_CLASSIFIER_CONFIG,
    },
  };
}

describe("ingestGmailMessage", () => {
  it("classifies a receipt email and enqueues receipt.parse", async () => {
    const { repos, jobs, deps } = makeIngestDeps({ "gmail-ingest-1": amazonMeta });
    const userId = newId<"UserId">();
    const account = await repos.mailAccounts.create(
      { userId, gmailAddress: "u@gmail.com" },
      "token",
    );

    await ingestGmailMessage(deps, {
      userId,
      mailAccountId: account.id,
      gmailMessageId: "gmail-ingest-1",
      refreshToken: "token",
    });

    const message = await repos.mailMessages.findByGmailMessageId(
      userId,
      account.id,
      "gmail-ingest-1",
    );
    expect(message?.processingStatus).toBe("classified");
    expect(message?.receiptKind).toBe("order_confirmation");

    expect(jobs.jobs).toHaveLength(1);
    expect(jobs.jobs[0]?.name).toBe("receipt.parse");
    expect(jobs.jobs[0]?.opts?.jobId).toBe("receipt.parse:gmail-ingest-1");
  });

  it("marks bank alert senders ignored without enqueuing parse", async () => {
    const { repos, jobs, deps } = makeIngestDeps({
      "gmail-chase-1": {
        ...amazonMeta,
        gmailMessageId: "gmail-chase-1",
        fromAddress: "Chase <alerts@chase.com>",
        subject: "Your purchase at Amazon",
      },
    });
    const userId = newId<"UserId">();
    const account = await repos.mailAccounts.create(
      { userId, gmailAddress: "u@gmail.com" },
      "token",
    );

    await ingestGmailMessage(deps, {
      userId,
      mailAccountId: account.id,
      gmailMessageId: "gmail-chase-1",
      refreshToken: "token",
    });

    const message = await repos.mailMessages.findByGmailMessageId(
      userId,
      account.id,
      "gmail-chase-1",
    );
    expect(message?.processingStatus).toBe("ignored");
    expect(message?.ignoreReason).toBe("bank_card_alert_from");
    expect(jobs.jobs).toHaveLength(0);
  });

  it("marks excluded marketing kind ignored without enqueuing parse", async () => {
    const { repos, jobs, deps } = makeIngestDeps({
      "gmail-promo-1": {
        ...amazonMeta,
        gmailMessageId: "gmail-promo-1",
        fromAddress: "Shop <shop@store.com>",
        subject: "50% off — sale ends tonight",
      },
    });
    const userId = newId<"UserId">();
    const account = await repos.mailAccounts.create(
      { userId, gmailAddress: "u@gmail.com" },
      "token",
    );

    await ingestGmailMessage(deps, {
      userId,
      mailAccountId: account.id,
      gmailMessageId: "gmail-promo-1",
      refreshToken: "token",
    });

    const message = await repos.mailMessages.findByGmailMessageId(
      userId,
      account.id,
      "gmail-promo-1",
    );
    expect(message?.processingStatus).toBe("ignored");
    expect(message?.receiptKind).toBe("marketing");
    expect(message?.ignoreReason).toBe("excluded_kind:marketing");
    expect(jobs.jobs).toHaveLength(0);
  });

  it("returns early when the gmail message was already ingested", async () => {
    const { repos, jobs, deps } = makeIngestDeps({ "gmail-ingest-1": amazonMeta });
    const userId = newId<"UserId">();
    const account = await repos.mailAccounts.create(
      { userId, gmailAddress: "u@gmail.com" },
      "token",
    );

    const ctx = {
      userId,
      mailAccountId: account.id,
      gmailMessageId: "gmail-ingest-1",
      refreshToken: "token",
    };
    await ingestGmailMessage(deps, ctx);
    await ingestGmailMessage(deps, ctx);

    expect(jobs.jobs).toHaveLength(1);
  });
});
