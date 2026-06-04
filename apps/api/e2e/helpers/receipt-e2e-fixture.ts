import {
  Money,
  type Repositories,
  type TransactionId,
  type User,
} from "@expense/core";
import {
  aTransaction,
  FixedClock,
  mailOptionsForScenario,
  makeFakeMailProvider,
  receiptScenarioById,
  type ReceiptPipelineScenario,
  type TestRepositories,
} from "@expense/core/testing";
import type { PrismaClient } from "@expense/db";
import { insertUser, seedTenantGraph } from "@expense/db/testing";
import { encodeGmailPushData } from "@expense/gmail";

export const GMAIL_RECEIPT_E2E_ADDRESS = "shopper@gmail.com";
export const GMAIL_RECEIPT_E2E_HISTORY_ID = "6000";
export const GMAIL_RECEIPT_E2E_CLOCK = new FixedClock(
  new Date("2026-05-25T15:00:00.000Z"),
);
export const GMAIL_RECEIPT_E2E_ISO_WEEK = "2026-W21";

export function gmailReceiptScenario(
  id: "amazon-happy-path" | "amount-mismatch-no-link",
): ReceiptPipelineScenario {
  return receiptScenarioById(id);
}

export function buildGmailReceiptE2eMail(scenario: ReceiptPipelineScenario) {
  return makeFakeMailProvider({
    gmailAddress: GMAIL_RECEIPT_E2E_ADDRESS,
    push: {
      gmailAddress: GMAIL_RECEIPT_E2E_ADDRESS,
      historyId: GMAIL_RECEIPT_E2E_HISTORY_ID,
    },
    ...mailOptionsForScenario(scenario),
  });
}

export function buildGmailPushRequestBody(): string {
  const data = encodeGmailPushData({
    emailAddress: GMAIL_RECEIPT_E2E_ADDRESS,
    historyId: GMAIL_RECEIPT_E2E_HISTORY_ID,
  });
  return JSON.stringify({ message: { data } });
}

/** Seed user, Gmail account, and optional Plaid charges for a receipt scenario. */
export async function seedGmailReceiptE2e(input: {
  readonly repos: Repositories;
  readonly user: User;
  readonly scenario: ReceiptPipelineScenario;
  readonly prisma?: PrismaClient;
}): Promise<{ transactionId: TransactionId | null }> {
  const { repos, user, scenario, prisma } = input;

  if (prisma) {
    await insertUser(prisma, user);
  } else {
    (repos as TestRepositories)._seed.user(user);
  }

  await repos.mailAccounts.create(
    { userId: user.id, gmailAddress: GMAIL_RECEIPT_E2E_ADDRESS },
    "gmail-e2e-refresh-token",
  );

  const seed = scenario.seedTransactions?.[0];
  if (!seed) {
    return { transactionId: null };
  }

  const txn = aTransaction({
    userId: user.id,
    merchantName: seed.merchantName,
    category: seed.category,
    amount: Money.of(seed.amountMinorUnits, "USD"),
    occurredAt: seed.occurredAt ?? new Date("2026-05-20T12:00:00.000Z"),
  });

  if (prisma) {
    await seedTenantGraph(
      prisma,
      { userId: user.id, accountId: txn.accountId },
      { email: user.email, timezone: user.timezone },
    );
    await repos.transactions.upsertMany(user.id, [txn]);
  } else {
    (repos as TestRepositories)._seed.transaction(txn);
  }

  return { transactionId: txn.id };
}
