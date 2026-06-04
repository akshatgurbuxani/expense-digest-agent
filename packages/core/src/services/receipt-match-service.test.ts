import { describe, it, expect } from "vitest";
import { Money } from "../money.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { newId } from "../ids.js";
import type {
  MailAccountId,
  MailMessageId,
  ReceiptId,
  TransactionId,
  UserId,
} from "../ids.js";
import { makeReceiptMatchService } from "./receipt-match-service.js";
import { aTransaction } from "../testing/builders.js";
import { makeInMemoryRepositories } from "../testing/in-memory-repos.js";
import { FixedClock } from "../testing/fixed-clock.js";
import { TEST_RECEIPT_MATCH_CONFIG } from "../testing/tunables.js";

const clock = new FixedClock(new Date("2026-05-20T12:00:00.000Z"));
const matchConfig = TEST_RECEIPT_MATCH_CONFIG;

function makeMatchService(repos: ReturnType<typeof makeInMemoryRepositories>) {
  return makeReceiptMatchService({
    transactions: repos.transactions,
    receipts: repos.receipts,
    mailMessages: repos.mailMessages,
    transactionReceiptLinks: repos.transactionReceiptLinks,
    clock,
    matchConfig,
    categoriesTriggerMatch: [...matchConfig.categoryBonusCategories],
  });
}

function seedReceiptGraph(input: {
  userId: UserId;
  mailAccountId: MailAccountId;
  mailMessageId: MailMessageId;
  receiptId: ReceiptId;
  transactionId: TransactionId;
  receiptAmountMinorUnits: number;
  txnAmountMinorUnits: number;
  merchantName?: string;
}) {
  const repos = makeInMemoryRepositories();
  const receivedAt = new Date("2026-05-20T18:00:00.000Z");
  const occurredAt = new Date("2026-05-20T12:00:00.000Z");

  repos._seed.mailAccount(
    {
      id: input.mailAccountId,
      userId: input.userId,
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
    id: input.mailMessageId,
    userId: input.userId,
    mailAccountId: input.mailAccountId,
    gmailMessageId: "gmail-match-1",
    threadId: "thread-1",
    receivedAt,
    fromAddress: "Amazon <order-update@amazon.com>",
    fromDomain: "amazon.com",
    subject: "Your order",
    processingStatus: "parsed",
    ignoreReason: null,
    receiptKind: "order_confirmation",
  });
  repos._seed.receipt({
    id: input.receiptId,
    userId: input.userId,
    mailMessageId: input.mailMessageId,
    kind: "order_confirmation",
    merchantName: input.merchantName ?? "Amazon",
    merchantDomain: "amazon.com",
    orderId: null,
    orderUrl: null,
    totalAmount: Money.of(input.receiptAmountMinorUnits, "USD"),
    occurredAt: receivedAt,
    lineItems: [],
    extractedAt: clock.now(),
    extractionSource: "heuristic",
    confidence: 0.9,
  });
  repos._seed.transaction(
    aTransaction({
      id: input.transactionId,
      userId: input.userId,
      merchantName: input.merchantName ?? "Amazon",
      category: "shopping",
      amount: Money.of(input.txnAmountMinorUnits, "USD"),
      occurredAt,
    }),
  );

  return repos;
}

describe("makeReceiptMatchService", () => {
  it("links receipt to transaction when score meets threshold (by receiptId)", async () => {
    const userId = newId<"UserId">();
    const receiptId = newId<"ReceiptId">();
    const transactionId = newId<"TransactionId">();
    const repos = seedReceiptGraph({
      userId,
      mailAccountId: newId<"MailAccountId">(),
      mailMessageId: newId<"MailMessageId">(),
      receiptId,
      transactionId,
      receiptAmountMinorUnits: 4599,
      txnAmountMinorUnits: 4599,
    });

    await makeMatchService(repos).run({ userId, receiptId });

    const link = await repos.transactionReceiptLinks.findByReceiptId(
      userId,
      receiptId,
    );
    expect(link?.transactionId).toBe(transactionId);
    expect(link?.matchScore).toBeGreaterThanOrEqual(matchConfig.minScore);

    const message = await repos.mailMessages.findById(
      userId,
      (await repos.receipts.findById(userId, receiptId))!.mailMessageId,
    );
    expect(message?.processingStatus).toBe("matched");
  });

  it("does not link when amounts diverge beyond tolerance (by receiptId)", async () => {
    const userId = newId<"UserId">();
    const receiptId = newId<"ReceiptId">();
    const repos = seedReceiptGraph({
      userId,
      mailAccountId: newId<"MailAccountId">(),
      mailMessageId: newId<"MailMessageId">(),
      receiptId,
      transactionId: newId(),
      receiptAmountMinorUnits: 4599,
      txnAmountMinorUnits: 5000,
    });

    await makeMatchService(repos).run({ userId, receiptId });

    expect(
      await repos.transactionReceiptLinks.findByReceiptId(userId, receiptId),
    ).toBeNull();
  });

  it("is idempotent when the receipt is already linked", async () => {
    const userId = newId<"UserId">();
    const receiptId = newId<"ReceiptId">();
    const transactionId = newId<"TransactionId">();
    const repos = seedReceiptGraph({
      userId,
      mailAccountId: newId<"MailAccountId">(),
      mailMessageId: newId<"MailMessageId">(),
      receiptId,
      transactionId,
      receiptAmountMinorUnits: 4599,
      txnAmountMinorUnits: 4599,
    });
    repos._seed.receiptLink({
      userId,
      receiptId,
      transactionId,
      matchScore: 90,
      matchReason: "existing",
      linkedAt: clock.now(),
    });

    await makeMatchService(repos).run({ userId, receiptId });

    expect(
      await repos.transactionReceiptLinks.findByReceiptId(userId, receiptId),
    ).toMatchObject({ matchReason: "existing" });
  });

  it("links from transactionId when category is eligible", async () => {
    const userId = newId<"UserId">();
    const receiptId = newId<"ReceiptId">();
    const transactionId = newId<"TransactionId">();
    const mailMessageId = newId<"MailMessageId">();
    const repos = seedReceiptGraph({
      userId,
      mailAccountId: newId(),
      mailMessageId,
      receiptId,
      transactionId,
      receiptAmountMinorUnits: 4599,
      txnAmountMinorUnits: 4599,
    });

    await makeMatchService(repos).run({ userId, transactionId });

    const link = await repos.transactionReceiptLinks.findByTransactionId(
      userId,
      transactionId,
    );
    expect(link?.receiptId).toBe(receiptId);

    const message = await repos.mailMessages.findById(userId, mailMessageId);
    expect(message?.processingStatus).toBe("matched");
  });

  it("skips transaction-triggered match when category is not eligible", async () => {
    const userId = newId<"UserId">();
    const receiptId = newId<"ReceiptId">();
    const transactionId = newId<"TransactionId">();
    const repos = seedReceiptGraph({
      userId,
      mailAccountId: newId<"MailAccountId">(),
      mailMessageId: newId<"MailMessageId">(),
      receiptId,
      transactionId,
      receiptAmountMinorUnits: 4599,
      txnAmountMinorUnits: 4599,
    });
    const txn = await repos.transactions.findById(userId, transactionId);
    repos._seed.transaction({
      ...txn!,
      category: "other",
    });

    await makeMatchService(repos).run({ userId, transactionId });

    expect(
      await repos.transactionReceiptLinks.findByTransactionId(
        userId,
        transactionId,
      ),
    ).toBeNull();
  });

  it("throws NotFoundError when receiptId does not exist", async () => {
    const repos = makeInMemoryRepositories();
    await expect(
      makeMatchService(repos).run({
        userId: newId(),
        receiptId: newId(),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ValidationError when neither receiptId nor transactionId is provided", async () => {
    const repos = makeInMemoryRepositories();
    await expect(makeMatchService(repos).run({ userId: newId() })).rejects.toThrow(
      ValidationError,
    );
  });
});
