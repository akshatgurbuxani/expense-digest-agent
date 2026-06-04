import { describe, it, expect } from "vitest";
import { Money } from "../money.js";
import { newId } from "../ids.js";
import { aTransaction } from "../testing/builders.js";
import { makeFakeMailProvider } from "../testing/fake-mail.js";
import { makeMailPipelineHarness } from "../testing/mail-pipeline.harness.js";
import { TEST_RECEIPT_MATCH_CONFIG } from "../testing/tunables.js";

describe("mail receipt heartbeat (in-memory)", () => {
  it("mail.sync → parse → match links receipt to Plaid transaction", async () => {
    const mail = makeFakeMailProvider({
      gmailAddress: "shopper@gmail.com",
      changePages: [
        {
          candidateMessageIds: ["gmail-order-1"],
          deletedMessageIds: [],
          nextHistoryId: "2001",
        },
      ],
      messages: {
        "gmail-order-1": {
          gmailMessageId: "gmail-order-1",
          threadId: "thread-1",
          receivedAt: new Date("2026-05-20T18:00:00.000Z"),
          fromAddress: "Amazon <order-update@amazon.com>",
          subject: "Your Amazon.com order has shipped",
          snippet: "Package on the way",
          labelIds: ["INBOX"],
          textPlain: "Order total: $45.99\nThanks for shopping.",
          textHtml: null,
        },
      },
    });

    const harness = makeMailPipelineHarness({ mail });
    const userId = newId<"UserId">();
    const { mailAccountId } = await harness.setupUser({ userId });

    const txn = aTransaction({
      userId,
      merchantName: "Amazon",
      category: "shopping",
      amount: Money.of(4599, "USD"),
      occurredAt: new Date("2026-05-20T12:00:00.000Z"),
    });
    harness.repos._seed.transaction(txn);

    await harness.runSync({ userId, mailAccountId });

    const link = await harness.repos.transactionReceiptLinks.findByTransactionId(
      userId,
      txn.id,
    );
    expect(link).not.toBeNull();
    expect(link?.receiptId).toBeTruthy();
    expect(link?.matchScore).toBeGreaterThanOrEqual(
      TEST_RECEIPT_MATCH_CONFIG.minScore,
    );

    const receipt = await harness.repos.receipts.findById(userId, link!.receiptId);
    expect(receipt?.merchantName).toBeTruthy();
    expect(receipt?.totalAmount?.minorUnits).toBe(4599);
  });

  it("mail.sync on expired history enqueues mail.fullSync", async () => {
    const mail = makeFakeMailProvider({
      expiredHistoryId: "expired-1",
      listPages: [
        {
          messageIds: ["gmail-backfill-1"],
          nextPageToken: null,
        },
      ],
      messages: {
        "gmail-backfill-1": {
          gmailMessageId: "gmail-backfill-1",
          threadId: "thread-b",
          receivedAt: new Date("2026-05-19T18:00:00.000Z"),
          fromAddress: "DoorDash <noreply@doordash.com>",
          subject: "Your receipt from Chipotle",
          snippet: null,
          labelIds: ["INBOX"],
          textPlain: "Order total: $18.50",
          textHtml: null,
        },
      },
    });

    const harness = makeMailPipelineHarness({ mail });
    const userId = newId<"UserId">();
    const { mailAccountId } = await harness.setupUser({ userId });
    await harness.repos.mailAccounts.saveHistoryId(
      mailAccountId,
      "expired-1",
      harness.clock.now(),
    );

    await harness.runSync({ userId, mailAccountId });

    expect(harness.queue.jobs.some((j) => j.name === "mail.fullSync")).toBe(true);

    const message = await harness.repos.mailMessages.findByGmailMessageId(
      userId,
      mailAccountId,
      "gmail-backfill-1",
    );
    expect(message).not.toBeNull();
    expect(message?.receiptKind).toBe("food_delivery");

    const receipt = await harness.repos.receipts.findByMailMessageId(
      userId,
      message!.id,
    );
    expect(receipt).not.toBeNull();
  });
});
