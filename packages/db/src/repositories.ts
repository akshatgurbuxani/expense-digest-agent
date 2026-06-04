import type { Crypto, Repositories } from "@expense/core";
import type { PrismaClient } from "@prisma/client";
import { makeAccountRepository } from "./account-repo.js";
import { makeAnomalyRepository } from "./anomaly-repo.js";
import { makeBaselineRepository } from "./baseline-repo.js";
import { makeReportRepository } from "./report-repo.js";
import { makeDigestRepository } from "./digest-repo.js";
import { makeItemRepository } from "./item-repo.js";
import { makeMerchantCategoryRepository } from "./merchant-category-repo.js";
import { makeTransactionRepository } from "./transaction-repo.js";
import { makeUserRepository } from "./user-repo.js";
import { makeMailAccountRepository } from "./mail-account-repo.js";
import { makeMailMessageRepository } from "./mail-message-repo.js";
import { makeReceiptRepository } from "./receipt-repo.js";
import { makeTransactionReceiptLinkRepository } from "./transaction-receipt-link-repo.js";

/** Build every repository port backed by Prisma + Crypto. */
export function makeRepositories(
  prisma: PrismaClient,
  crypto: Crypto,
): Repositories {
  return {
    users: makeUserRepository(prisma),
    items: makeItemRepository(prisma, crypto),
    accounts: makeAccountRepository(prisma),
    transactions: makeTransactionRepository(prisma),
    merchants: makeMerchantCategoryRepository(prisma),
    baselines: makeBaselineRepository(prisma),
    digests: makeDigestRepository(prisma),
    reports: makeReportRepository(prisma),
    anomalies: makeAnomalyRepository(prisma),
    mailAccounts: makeMailAccountRepository(prisma, crypto),
    mailMessages: makeMailMessageRepository(prisma),
    receipts: makeReceiptRepository(prisma),
    transactionReceiptLinks: makeTransactionReceiptLinkRepository(prisma),
  };
}
