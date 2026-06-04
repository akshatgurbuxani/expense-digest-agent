import { describe, it, expect } from "vitest";
import { Money } from "../money.js";
import { NotFoundError } from "../errors.js";
import { newId } from "../ids.js";
import type {
  MailAccountId,
  MailMessageId,
  ReceiptId,
  TransactionId,
  UserId,
} from "../ids.js";
import type { MailMessage } from "../domain/mail-message.js";
import { makeReceiptParseService } from "./receipt-parse-service.js";
import {
  makeInMemoryRepositories,
  type TestRepositories,
} from "../testing/in-memory-repos.js";
import { makeCapturingJobProducer } from "../testing/capturing-jobs.js";
import { makeFakeMailProvider } from "../testing/fake-mail.js";
import { makeFakeReceiptExtractor } from "../testing/fake-receipt-extractor.js";
import { FixedClock } from "../testing/fixed-clock.js";

const clock = new FixedClock(new Date("2026-05-20T12:00:00.000Z"));

const bodyMessage = {
  gmailMessageId: "gmail-parse-1",
  threadId: "thread-1",
  receivedAt: new Date("2026-05-20T18:00:00.000Z"),
  fromAddress: "Amazon <order-update@amazon.com>",
  subject: "Your Amazon.com order has shipped",
  snippet: null,
  labelIds: ["INBOX"],
  textPlain: "Order total: $45.99",
  textHtml: null,
};

async function seedClassifiedMessage(
  repos: TestRepositories,
  input: {
    userId: UserId;
    mailAccountId: MailAccountId;
    receiptKind: NonNullable<MailMessage["receiptKind"]>;
  },
): Promise<MailMessage> {
  const seen = await repos.mailMessages.upsertSeen({
    userId: input.userId,
    mailAccountId: input.mailAccountId,
    gmailMessageId: bodyMessage.gmailMessageId,
    threadId: bodyMessage.threadId,
    receivedAt: bodyMessage.receivedAt,
    fromAddress: bodyMessage.fromAddress,
    fromDomain: "amazon.com",
    subject: bodyMessage.subject,
  });
  await repos.mailMessages.updateClassification(input.userId, seen.id, {
    processingStatus: "classified",
    receiptKind: input.receiptKind,
    ignoreReason: null,
  });
  const updated = await repos.mailMessages.findById(input.userId, seen.id);
  return updated!;
}

function makeParseService(repos: TestRepositories, jobs = makeCapturingJobProducer()) {
  return {
    jobs,
    svc: makeReceiptParseService({
      mail: makeFakeMailProvider({ messages: { "gmail-parse-1": bodyMessage } }),
      mailAccounts: repos.mailAccounts,
      mailMessages: repos.mailMessages,
      receipts: repos.receipts,
      extractor: makeFakeReceiptExtractor(),
      queue: jobs,
      clock,
    }),
  };
}

describe("makeReceiptParseService", () => {
  it("extracts body, stores receipt, and enqueues receipt.match", async () => {
    const repos = makeInMemoryRepositories();
    const { svc, jobs } = makeParseService(repos);
    const userId = newId<"UserId">();
    const account = await repos.mailAccounts.create(
      { userId, gmailAddress: "u@gmail.com" },
      "token",
    );
    const message = await seedClassifiedMessage(repos, {
      userId,
      mailAccountId: account.id,
      receiptKind: "order_confirmation",
    });

    await svc.run({ userId, mailMessageId: message.id });

    const receipt = await repos.receipts.findByMailMessageId(userId, message.id);
    expect(receipt?.totalAmount?.minorUnits).toBe(4599);
    expect(receipt?.merchantName).toBeTruthy();

    const updated = await repos.mailMessages.findById(userId, message.id);
    expect(updated?.processingStatus).toBe("parsed");

    expect(jobs.jobs).toHaveLength(1);
    expect(jobs.jobs[0]?.name).toBe("receipt.match");
    expect(jobs.jobs[0]?.payload).toMatchObject({ receiptId: receipt?.id });
  });

  it("skips excluded receipt kinds", async () => {
    const repos = makeInMemoryRepositories();
    const { svc, jobs } = makeParseService(repos);
    const userId = newId<"UserId">();
    const account = await repos.mailAccounts.create(
      { userId, gmailAddress: "u@gmail.com" },
      "token",
    );
    const message = await seedClassifiedMessage(repos, {
      userId,
      mailAccountId: account.id,
      receiptKind: "marketing",
    });

    await svc.run({ userId, mailMessageId: message.id });

    expect(await repos.receipts.findByMailMessageId(userId, message.id)).toBeNull();
    expect(jobs.jobs).toHaveLength(0);
  });

  it("is idempotent when a receipt already exists", async () => {
    const repos = makeInMemoryRepositories();
    const { svc, jobs } = makeParseService(repos);
    const userId = newId<"UserId">();
    const mailAccountId = newId<"MailAccountId">();
    const mailMessageId = newId<"MailMessageId">();
    const receiptId = newId<"ReceiptId">();

    repos._seed.mailAccount(
      {
        id: mailAccountId,
        userId,
        gmailAddress: "u@gmail.com",
        historyId: null,
        lastSyncedAt: null,
        watchExpiresAt: null,
        status: "active",
        connectedAt: clock.now(),
      },
      "token",
    );
    repos._seed.mailMessage({
      id: mailMessageId,
      userId,
      mailAccountId,
      gmailMessageId: "gmail-parse-1",
      threadId: "thread-1",
      receivedAt: bodyMessage.receivedAt,
      fromAddress: bodyMessage.fromAddress,
      fromDomain: "amazon.com",
      subject: bodyMessage.subject,
      processingStatus: "classified",
      ignoreReason: null,
      receiptKind: "order_confirmation",
    });
    repos._seed.receipt({
      id: receiptId,
      userId,
      mailMessageId,
      kind: "order_confirmation",
      merchantName: "Amazon",
      merchantDomain: "amazon.com",
      orderId: null,
      orderUrl: null,
      totalAmount: Money.of(4599, "USD"),
      occurredAt: bodyMessage.receivedAt,
      lineItems: [],
      extractedAt: clock.now(),
      extractionSource: "heuristic",
      confidence: 0.9,
    });

    await svc.run({ userId, mailMessageId });

    expect(jobs.jobs).toHaveLength(0);
  });

  it("throws NotFoundError when the mail message is missing", async () => {
    const repos = makeInMemoryRepositories();
    const { svc } = makeParseService(repos);

    await expect(
      svc.run({ userId: newId(), mailMessageId: newId() }),
    ).rejects.toThrow(NotFoundError);
  });
});
