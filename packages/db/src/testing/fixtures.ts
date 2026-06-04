import type { Account, User } from "@expense/core";
import { newId } from "@expense/core";
import type {
  AccountId,
  ItemId,
  MailAccountId,
  MailMessageId,
  ReceiptId,
  TransactionId,
  UserId,
} from "@expense/core";
import type { PrismaClient } from "@prisma/client";

/** Fixed 32-byte key for integration tests only. */
export const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://expense:expense@localhost:5433/expense?schema=public";

/** Truncate all tenant data between tests. */
export async function clearDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.transactionReceiptLink.deleteMany(),
    prisma.receipt.deleteMany(),
    prisma.mailMessage.deleteMany(),
    prisma.mailAccount.deleteMany(),
    prisma.anomaly.deleteMany(),
    prisma.digest.deleteMany(),
    prisma.spendBaseline.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.merchantCategory.deleteMany(),
    prisma.account.deleteMany(),
    prisma.plaidItem.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export async function insertUser(prisma: PrismaClient, user: User): Promise<void> {
  await prisma.user.create({
    data: {
      id: user.id,
      email: user.email,
      timezone: user.timezone,
      digestDay: user.digestDay,
      digestTime: user.digestTime,
      deliveryPreference: user.deliveryPreference,
      createdAt: user.createdAt,
    },
  });
}

export async function insertAccount(
  prisma: PrismaClient,
  account: Account,
): Promise<void> {
  await prisma.account.create({
    data: {
      id: account.id,
      itemId: account.itemId,
      userId: account.userId,
      plaidAccountId: account.plaidAccountId,
      name: account.name,
      type: account.type,
      lastSyncedAt: account.lastSyncedAt,
    },
  });
}

/** Insert user, item, and account so transaction FK constraints succeed. */
export async function seedTenantGraph(
  prisma: PrismaClient,
  ctx: { userId: UserId; accountId: AccountId; itemId?: ItemId },
  userOverrides: Partial<User> = {},
): Promise<ItemId> {
  const itemId = ctx.itemId ?? newId<"ItemId">();
  const user: User = {
    id: ctx.userId,
    email: `${ctx.userId}@test.example.com`,
    timezone: "UTC",
    digestDay: 0,
    digestTime: "08:00",
    deliveryPreference: "email",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...userOverrides,
  };
  
  // Use upsert to make this idempotent
  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email,
      timezone: user.timezone,
      digestDay: user.digestDay,
      digestTime: user.digestTime,
      deliveryPreference: user.deliveryPreference,
      createdAt: user.createdAt,
    },
    update: {
      email: user.email,
      timezone: user.timezone,
    },
  });
  
  await prisma.plaidItem.upsert({
    where: { id: itemId },
    create: {
      id: itemId,
      userId: ctx.userId,
      plaidItemId: `plaid-item-${ctx.userId}`,
      accessTokenEncrypted: "test-ciphertext",
      status: "good",
    },
    update: {
      status: "good",
    },
  });
  
  await prisma.account.upsert({
    where: { id: ctx.accountId },
    create: {
      id: ctx.accountId,
      itemId,
      userId: ctx.userId,
      plaidAccountId: `plaid-acct-${ctx.accountId}`,
      name: "Checking",
      type: "depository",
      lastSyncedAt: null,
    },
    update: {
      lastSyncedAt: null,
    },
  });
  
  return itemId;
}

/** Seed user + mail account for mail message FK constraints. */
export async function seedMailAccount(
  prisma: PrismaClient,
  ctx: { userId: UserId; mailAccountId: MailAccountId },
): Promise<void> {
  const userExists = await prisma.user.findUnique({ where: { id: ctx.userId } });
  if (!userExists) {
    await insertUser(prisma, {
      id: ctx.userId,
      email: `${ctx.userId}@test.example.com`,
      timezone: "UTC",
      digestDay: 0,
      digestTime: "08:00",
      deliveryPreference: "email",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  }
  const accountExists = await prisma.mailAccount.findUnique({
    where: { id: ctx.mailAccountId },
  });
  if (!accountExists) {
    await prisma.mailAccount.create({
      data: {
        id: ctx.mailAccountId,
        userId: ctx.userId,
        gmailAddress: `${ctx.mailAccountId}@gmail.com`.toLowerCase(),
        refreshTokenEncrypted: "test-ciphertext",
        status: "active",
      },
    });
  }
}

/** Seed mail message row for receipt FK constraints. */
export async function seedMailMessage(
  prisma: PrismaClient,
  ctx: {
    userId: UserId;
    mailAccountId: MailAccountId;
    mailMessageId: MailMessageId;
  },
): Promise<void> {
  await seedMailAccount(prisma, {
    userId: ctx.userId,
    mailAccountId: ctx.mailAccountId,
  });
  const messageExists = await prisma.mailMessage.findUnique({
    where: { id: ctx.mailMessageId },
  });
  if (messageExists) return;

  await prisma.mailMessage.create({
    data: {
      id: ctx.mailMessageId,
      userId: ctx.userId,
      mailAccountId: ctx.mailAccountId,
      gmailMessageId: `gmail-${ctx.mailMessageId}`,
      threadId: "thread-1",
      receivedAt: new Date("2026-05-20T18:00:00.000Z"),
      fromAddress: "shop@store.com",
      fromDomain: "store.com",
      subject: "Receipt",
      processingStatus: "seen",
    },
  });
}

/** Seed transaction + receipt rows for link FK constraints. */
export async function seedReceiptLinkGraph(
  prisma: PrismaClient,
  ctx: {
    userId: UserId;
    accountId: AccountId;
    transactionId: TransactionId;
    receiptId: ReceiptId;
    mailMessageId: MailMessageId;
    mailAccountId?: MailAccountId;
  },
): Promise<void> {
  const mailAccountId = ctx.mailAccountId ?? newId<"MailAccountId">();
  const accountExists = await prisma.account.findUnique({
    where: { id: ctx.accountId },
  });
  if (!accountExists) {
    await seedTenantGraph(prisma, { userId: ctx.userId, accountId: ctx.accountId });
  }
  await seedMailMessage(prisma, {
    userId: ctx.userId,
    mailAccountId,
    mailMessageId: ctx.mailMessageId,
  });

  const txnExists = await prisma.transaction.findUnique({
    where: { id: ctx.transactionId },
  });
  if (!txnExists) {
    await prisma.transaction.create({
      data: {
        id: ctx.transactionId,
        accountId: ctx.accountId,
        userId: ctx.userId,
        plaidTransactionId: `plaid-${ctx.transactionId}`,
        amountMinorUnits: 4599,
        currency: "USD",
        merchantNameRaw: "Amazon",
        occurredAt: new Date("2026-05-20T18:00:00.000Z"),
      },
    });
  }

  const receiptExists = await prisma.receipt.findUnique({
    where: { id: ctx.receiptId },
  });
  if (!receiptExists) {
    await prisma.receipt.create({
      data: {
        id: ctx.receiptId,
        userId: ctx.userId,
        mailMessageId: ctx.mailMessageId,
        kind: "order_confirmation",
        merchantName: "Amazon",
        lineItemsJson: [],
        extractedAt: new Date("2026-05-20T18:05:00.000Z"),
        extractionSource: "heuristic",
        confidence: 0.9,
        totalAmountMinorUnits: 4599,
        totalAmountCurrency: "USD",
      },
    });
  }
}
