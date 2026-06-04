import { beforeEach, describe, it, expect } from "vitest";
import { makeCrypto } from "@expense/config";
import {
  mailAccountRepositoryContract,
  mailMessageRepositoryContract,
  receiptRepositoryContract,
  transactionReceiptLinkRepositoryContract,
} from "@expense/core/testing/contracts";
import { Money, newId } from "@expense/core";
import { makePrisma } from "./client.js";
import { makeMailAccountRepository } from "./mail-account-repo.js";
import { makeMailMessageRepository } from "./mail-message-repo.js";
import { makeReceiptRepository } from "./receipt-repo.js";
import { makeTransactionReceiptLinkRepository } from "./transaction-receipt-link-repo.js";
import {
  TEST_DATABASE_URL,
  TEST_ENCRYPTION_KEY,
  clearDatabase,
  seedMailAccount,
  seedMailMessage,
  seedReceiptLinkGraph,
} from "./testing/fixtures.js";

const prisma = makePrisma(TEST_DATABASE_URL);
const crypto = makeCrypto(TEST_ENCRYPTION_KEY);
const linkAccountByUser = new Map<string, import("@expense/core").AccountId>();
const linkMailAccountByUser = new Map<
  string,
  import("@expense/core").MailAccountId
>();

beforeEach(async () => {
  await clearDatabase(prisma);
  linkAccountByUser.clear();
  linkMailAccountByUser.clear();
});

mailAccountRepositoryContract(
  () => makeMailAccountRepository(prisma, crypto),
  "Prisma",
  {
    prepare: async ({ userId }) => {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@test.example.com`,
          timezone: "UTC",
          digestDay: 0,
          digestTime: "08:00",
          deliveryPreference: "email",
        },
      });
    },
  },
);

mailMessageRepositoryContract(
  () => makeMailMessageRepository(prisma),
  "Prisma",
  {
    prepare: async ({ userId, mailAccountId }) => {
      await seedMailAccount(prisma, { userId, mailAccountId });
    },
  },
);

receiptRepositoryContract(() => makeReceiptRepository(prisma), "Prisma", {
  prepare: async ({ userId, mailMessageId }) => {
    await seedMailMessage(prisma, {
      userId,
      mailAccountId: newId<"MailAccountId">(),
      mailMessageId,
    });
  },
});

transactionReceiptLinkRepositoryContract(
  () => makeTransactionReceiptLinkRepository(prisma),
  "Prisma",
  {
    prepare: async ({ userId, transactionId, receiptId, mailMessageId }) => {
      const accountId = linkAccountByUser.get(userId) ?? newId<"AccountId">();
      linkAccountByUser.set(userId, accountId);
      const mailAccountId =
        linkMailAccountByUser.get(userId) ?? newId<"MailAccountId">();
      linkMailAccountByUser.set(userId, mailAccountId);
      await seedReceiptLinkGraph(prisma, {
        userId,
        accountId,
        mailAccountId,
        transactionId,
        receiptId,
        mailMessageId,
      });
    },
  },
);

describe("MailAccountRepository.withRefreshToken (Prisma)", () => {
  it("decrypts refresh token only inside the callback", async () => {
    const repo = makeMailAccountRepository(prisma, crypto);
    const userId = newId<"UserId">();
    await prisma.user.create({
      data: {
        id: userId,
        email: "mail-crypto@test.example.com",
        timezone: "UTC",
        digestDay: 0,
        digestTime: "08:00",
        deliveryPreference: "email",
      },
    });

    const account = await repo.create(
      { userId, gmailAddress: "crypto@gmail.com" },
      "secret-refresh-token",
    );

    const row = await prisma.mailAccount.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(row.refreshTokenEncrypted).not.toBe("secret-refresh-token");

    let seen: string | undefined;
    await repo.withRefreshToken(account.id, async (token) => {
      seen = token;
      return null;
    });
    expect(seen).toBe("secret-refresh-token");
  });
});

describe("ReceiptRepository.listUnmatchedInWindow (Prisma)", () => {
  it("excludes linked receipts in the date window", async () => {
    const repo = makeReceiptRepository(prisma);
    const linkRepo = makeTransactionReceiptLinkRepository(prisma);
    const userId = newId<"UserId">();
    const accountId = newId<"AccountId">();
    const mailAccountId = newId<"MailAccountId">();
    const mailMessageA = newId<"MailMessageId">();
    const mailMessageB = newId<"MailMessageId">();
    const receiptA = newId<"ReceiptId">();
    const receiptB = newId<"ReceiptId">();
    const txnA = newId<"TransactionId">();
    const extractedAt = new Date("2026-05-20T18:05:00.000Z");
    const windowStart = new Date("2026-05-20T00:00:00.000Z");
    const windowEnd = new Date("2026-05-21T00:00:00.000Z");

    await seedReceiptLinkGraph(prisma, {
      userId,
      accountId,
      mailAccountId,
      mailMessageId: mailMessageA,
      transactionId: txnA,
      receiptId: receiptA,
    });
    await seedMailMessage(prisma, {
      userId,
      mailAccountId,
      mailMessageId: mailMessageB,
    });
    await repo.create({
      id: receiptB,
      userId,
      mailMessageId: mailMessageB,
      kind: "order_confirmation",
      merchantName: "Target",
      merchantDomain: null,
      orderId: null,
      orderUrl: null,
      totalAmount: Money.of(1200, "USD"),
      occurredAt: extractedAt,
      lineItems: [],
      extractedAt,
      extractionSource: "heuristic",
      confidence: 0.8,
    });
    await linkRepo.link({
      userId,
      transactionId: txnA,
      receiptId: receiptA,
      matchScore: 90,
      matchReason: "exactAmount",
      linkedAt: new Date("2026-05-21T00:00:00.000Z"),
    });

    const unmatched = await repo.listUnmatchedInWindow(
      userId,
      windowStart,
      windowEnd,
    );
    expect(unmatched.map((r) => r.id)).toEqual([receiptB]);
  });
});
