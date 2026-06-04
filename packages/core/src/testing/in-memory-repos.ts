import { NotFoundError, InvariantError } from "../errors.js";
import { newId } from "../ids.js";
import type {
  AnomalyId,
  DigestId,
  ReportId,
  ItemId,
  MailAccountId,
  MailMessageId,
  ReceiptId,
  TransactionId,
  UserId,
} from "../ids.js";
import type { Anomaly } from "../domain/anomaly.js";
import type { SpendBaseline } from "../domain/baseline.js";
import type { Category } from "../domain/category.js";
import type { Digest } from "../domain/digest.js";
import type { MonthlyReport } from "../domain/monthly-report.js";
import type { Account } from "../domain/account.js";
import type { Item, ItemStatus } from "../domain/item.js";
import type { Transaction } from "../domain/transaction.js";
import type { User } from "../domain/user.js";
import type { MailAccount } from "../domain/mail-account.js";
import type { MailMessage } from "../domain/mail-message.js";
import type { Receipt } from "../domain/receipt.js";
import type { TransactionReceiptLink } from "../domain/transaction-receipt-link.js";
import { isDueForMonthlyReport } from "../report-schedule.js";
import type {
  AccountRepository,
  AnomalyRepository,
  BaselineRepository,
  CachedMerchant,
  DigestRepository,
  ReportRepository,
  ItemRepository,
  MailAccountRepository,
  MailMessageRepository,
  MerchantCategoryRepository,
  Period,
  ReceiptRepository,
  Repositories,
  TransactionReceiptLinkRepository,
  TransactionRepository,
  UserRepository,
} from "../ports/repositories.js";

export type TestRepositories = Repositories & {
  _seed: {
    user: (u: User) => void;
    item: (item: Item, token: string) => void;
    account: (acct: Account) => void;
    transaction: (t: Transaction) => void;
    mailAccount: (account: MailAccount, refreshToken: string) => void;
    mailMessage: (message: MailMessage) => void;
    receipt: (receipt: Receipt) => void;
    receiptLink: (link: TransactionReceiptLink) => void;
  };
  /** Test/demo helper — list all mail messages for a tenant. */
  listMailMessagesForUser(userId: UserId): readonly MailMessage[];
  /** Test/demo helper — list all receipts for a tenant. */
  listReceiptsForUser(userId: UserId): readonly Receipt[];
};

export function makeInMemoryRepositories(): TestRepositories {
  const users = new Map<UserId, User>();
  const items = new Map<ItemId, Item>();
  const itemTokens = new Map<ItemId, string>();
  const itemsByPlaid = new Map<string, ItemId>();
  const accountsByPlaid = new Map<string, Account>();
  const txnsByPlaid = new Map<string, Transaction>();
  const txnsById = new Map<TransactionId, Transaction>();
  const merchants = new Map<string, CachedMerchant>();
  const baselines = new Map<string, SpendBaseline>();
  const digests = new Map<DigestId, Digest>();
  const reports = new Map<ReportId, MonthlyReport>();
  const anomalies = new Map<AnomalyId, Anomaly>();
  const mailAccounts = new Map<MailAccountId, MailAccount>();
  const mailRefreshTokens = new Map<MailAccountId, string>();
  const mailAccountsByGmail = new Map<string, MailAccountId>();
  const mailMessages = new Map<MailMessageId, MailMessage>();
  const mailMessagesByGmail = new Map<string, MailMessageId>();
  const receipts = new Map<ReceiptId, Receipt>();
  const receiptLinksByTxn = new Map<string, TransactionReceiptLink>();
  const receiptLinksByReceipt = new Map<string, TransactionReceiptLink>();

  const userRepo: UserRepository = {
    async findById(id) {
      return users.get(id) ?? null;
    },
    async findDueForDigest(_at) {
      return [...users.values()];
    },
    async findDueForMonthlyReport(at, schedule) {
      return [...users.values()].filter((user) =>
        isDueForMonthlyReport(user, at, schedule),
      );
    },
    async updatePreferences(id, prefs) {
      const u = users.get(id);
      if (!u) throw new NotFoundError(`user ${id}`);
      users.set(id, { ...u, ...prefs });
    },
  };

  const itemRepo: ItemRepository = {
    async create(newItem, accessTokenPlaintext) {
      const id = newId<"ItemId">();
      const item: Item = {
        id,
        userId: newItem.userId,
        plaidItemId: newItem.plaidItemId,
        status: "good",
        syncCursor: null,
        lastSyncedAt: null,
      };
      items.set(id, item);
      itemTokens.set(id, accessTokenPlaintext);
      itemsByPlaid.set(newItem.plaidItemId, id);
      return item;
    },
    async findById(id) {
      return items.get(id) ?? null;
    },
    async findByPlaidItemId(plaidItemId) {
      const id = itemsByPlaid.get(plaidItemId);
      return id ? (items.get(id) ?? null) : null;
    },
    async listByUserId(userId) {
      return [...items.values()].filter((item) => item.userId === userId);
    },
    async withAccessToken(id, fn) {
      const token = itemTokens.get(id);
      if (!token) throw new NotFoundError(`item ${id}`);
      return fn(token);
    },
    async saveCursor(id, cursor, syncedAt) {
      const item = items.get(id);
      if (!item) throw new NotFoundError(`item ${id}`);
      items.set(id, { ...item, syncCursor: cursor, lastSyncedAt: syncedAt });
    },
    async setStatus(id, status: ItemStatus) {
      const item = items.get(id);
      if (!item) throw new NotFoundError(`item ${id}`);
      items.set(id, { ...item, status });
    },
  };

  const accountRepo: AccountRepository = {
    async findByPlaidAccountId(userId, plaidAccountId) {
      const acct = accountsByPlaid.get(plaidAccountId);
      return acct && acct.userId === userId ? acct : null;
    },
  };

  const txnRepo: TransactionRepository = {
    async upsertMany(userId, txns) {
      const insertedIds: TransactionId[] = [];
      for (const t of txns) {
        if (t.userId !== userId) {
          throw new Error("tenant mismatch on upsert");
        }
        const existing = txnsByPlaid.get(t.plaidTransactionId);
        if (!existing) insertedIds.push(t.id);
        txnsByPlaid.set(t.plaidTransactionId, { ...t, userId });
        txnsById.set(t.id, { ...t, userId });
      }
      return { insertedIds };
    },
    async softDeleteByPlaidIds(userId, plaidIds, removedAt) {
      const ts = removedAt ?? new Date();
      for (const pid of plaidIds) {
        const t = txnsByPlaid.get(pid);
        if (t && t.userId === userId) {
          const updated = { ...t, removedAt: ts };
          txnsByPlaid.set(pid, updated);
          txnsById.set(t.id, updated);
        }
      }
    },
    async findById(userId, id) {
      const t = txnsById.get(id);
      return t && t.userId === userId ? t : null;
    },
    async saveEnrichment(userId, id, enrichment) {
      const t = txnsById.get(id);
      if (!t || t.userId !== userId) throw new NotFoundError(`transaction ${id}`);
      const updated: Transaction = {
        ...t,
        merchantName: enrichment.merchantName,
        category: enrichment.category,
        isSubscription: enrichment.isSubscription,
        isRecurring: enrichment.isRecurring,
        enrichedAt: enrichment.enrichedAt,
      };
      txnsById.set(id, updated);
      txnsByPlaid.set(t.plaidTransactionId, updated);
    },
    async listForUser(userId) {
      return [...txnsById.values()].filter(
        (t) => t.userId === userId && !t.removedAt,
      );
    },
    async listInWindow(userId, start, end) {
      return [...txnsById.values()].filter(
        (t) =>
          t.userId === userId &&
          !t.removedAt &&
          t.occurredAt >= start &&
          t.occurredAt < end,
      );
    },
    async recentForMerchant(userId, merchant, since) {
      const needle = merchant.toLowerCase();
      return [...txnsById.values()].filter(
        (t) =>
          t.userId === userId &&
          !t.removedAt &&
          t.occurredAt >= since &&
          (t.merchantName ?? t.merchantNameRaw).toLowerCase().includes(needle),
      );
    },
  };

  const merchantRepo: MerchantCategoryRepository = {
    async lookup(normalizedMerchant) {
      return merchants.get(normalizedMerchant) ?? null;
    },
    async upsert(entry) {
      merchants.set(entry.normalizedMerchant, entry);
    },
  };

  const baselineRepo: BaselineRepository = {
    async get(userId, category, period) {
      return baselines.get(baselineKey(userId, category, period)) ?? null;
    },
    async getAll(userId, period) {
      return [...baselines.values()].filter(
        (b) => b.userId === userId && b.period === period,
      );
    },
    async upsertMany(userId, rows) {
      for (const b of rows) {
        if (b.userId !== userId) throw new Error("tenant mismatch on baseline");
        baselines.set(baselineKey(userId, b.category, b.period), b);
      }
    },
  };

  const digestRepo: DigestRepository = {
    async create(digest) {
      digests.set(digest.id, digest);
    },
    async markDelivered(id, at) {
      const d = digests.get(id);
      if (!d) throw new NotFoundError(`digest ${id}`);
      digests.set(id, { ...d, deliveredAt: at });
    },
    async history(userId, limit) {
      return [...digests.values()]
        .filter((d) => d.userId === userId)
        .slice(-limit);
    },
  };

  const reportRepo: ReportRepository = {
    async create(report) {
      reports.set(report.id, report);
    },
    async markDelivered(id, at) {
      const report = reports.get(id);
      if (!report) throw new NotFoundError(`report ${id}`);
      reports.set(id, { ...report, deliveredAt: at });
    },
    async findById(userId, id) {
      const report = reports.get(id);
      return report && report.userId === userId ? report : null;
    },
    async findByYearMonth(userId, yearMonth) {
      return (
        [...reports.values()].find(
          (r) => r.userId === userId && r.yearMonth === yearMonth,
        ) ?? null
      );
    },
  };

  const anomalyRepo: AnomalyRepository = {
    async create(anomaly) {
      anomalies.set(anomaly.id, anomaly);
    },
    async markDelivered(id, at) {
      const a = anomalies.get(id);
      if (!a) throw new NotFoundError(`anomaly ${id}`);
      anomalies.set(id, { ...a, deliveredAt: at });
    },
    async listUndeliveredInWindow(userId, start, end) {
      return [...anomalies.values()].filter(
        (a) =>
          a.userId === userId &&
          !a.deliveredAt &&
          a.detectedAt >= start &&
          a.detectedAt < end,
      );
    },
    async listRecent(userId, limit) {
      return [...anomalies.values()]
        .filter((a) => a.userId === userId)
        .slice(-limit);
    },
  };

  const mailAccountRepo: MailAccountRepository = {
    async create(newAccount, refreshTokenPlaintext) {
      const id = newId<"MailAccountId">();
      const account: MailAccount = {
        id,
        userId: newAccount.userId,
        gmailAddress: newAccount.gmailAddress,
        status: "active",
        historyId: null,
        watchExpiresAt: null,
        lastSyncedAt: null,
        connectedAt: new Date(),
      };
      mailAccounts.set(id, account);
      mailRefreshTokens.set(id, refreshTokenPlaintext);
      mailAccountsByGmail.set(newAccount.gmailAddress.toLowerCase(), id);
      return account;
    },
    async findById(id) {
      return mailAccounts.get(id) ?? null;
    },
    async findByUserId(userId) {
      return (
        [...mailAccounts.values()].find((a) => a.userId === userId) ?? null
      );
    },
    async findByGmailAddress(gmailAddress) {
      const id = mailAccountsByGmail.get(gmailAddress.toLowerCase());
      return id ? (mailAccounts.get(id) ?? null) : null;
    },
    async listActive() {
      return [...mailAccounts.values()].filter((a) => a.status === "active");
    },
    async withRefreshToken(id, fn) {
      const token = mailRefreshTokens.get(id);
      if (!token) throw new NotFoundError(`mail account ${id}`);
      return fn(token);
    },
    async saveRefreshToken(id, refreshTokenPlaintext) {
      if (!mailAccounts.has(id)) {
        throw new NotFoundError(`mail account ${id}`);
      }
      mailRefreshTokens.set(id, refreshTokenPlaintext);
    },
    async saveHistoryId(id, historyId, syncedAt) {
      const account = mailAccounts.get(id);
      if (!account) throw new NotFoundError(`mail account ${id}`);
      mailAccounts.set(id, {
        ...account,
        historyId,
        lastSyncedAt: syncedAt,
      });
    },
    async saveWatchExpiration(id, expiresAt, historyId) {
      const account = mailAccounts.get(id);
      if (!account) throw new NotFoundError(`mail account ${id}`);
      mailAccounts.set(id, {
        ...account,
        watchExpiresAt: expiresAt,
        historyId: account.historyId ?? historyId,
      });
    },
    async setStatus(id, status) {
      const account = mailAccounts.get(id);
      if (!account) throw new NotFoundError(`mail account ${id}`);
      mailAccounts.set(id, { ...account, status });
    },
  };

  const mailMessageRepo: MailMessageRepository = {
    async findByGmailMessageId(userId, mailAccountId, gmailMessageId) {
      const id = mailMessagesByGmail.get(
        mailMessageKey(userId, mailAccountId, gmailMessageId),
      );
      if (!id) return null;
      const msg = mailMessages.get(id);
      return msg && msg.userId === userId ? msg : null;
    },
    async findById(userId, id) {
      const msg = mailMessages.get(id);
      return msg && msg.userId === userId ? msg : null;
    },
    async upsertSeen(input) {
      const existingId = mailMessagesByGmail.get(
        mailMessageKey(input.userId, input.mailAccountId, input.gmailMessageId),
      );
      if (existingId) {
        const existing = mailMessages.get(existingId);
        if (existing) return existing;
      }
      const id = newId<"MailMessageId">();
      const message: MailMessage = {
        id,
        userId: input.userId,
        mailAccountId: input.mailAccountId,
        gmailMessageId: input.gmailMessageId,
        threadId: input.threadId,
        receivedAt: input.receivedAt,
        fromAddress: input.fromAddress,
        fromDomain: input.fromDomain,
        subject: input.subject,
        processingStatus: "seen",
        ignoreReason: null,
        receiptKind: null,
      };
      mailMessages.set(id, message);
      mailMessagesByGmail.set(
        mailMessageKey(input.userId, input.mailAccountId, input.gmailMessageId),
        id,
      );
      return message;
    },
    async updateClassification(userId, id, update) {
      const msg = mailMessages.get(id);
      if (!msg || msg.userId !== userId) {
        throw new NotFoundError(`mail message ${id}`);
      }
      mailMessages.set(id, {
        ...msg,
        processingStatus: update.processingStatus,
        receiptKind: update.receiptKind,
        ignoreReason: update.ignoreReason,
      });
    },
    async markDeleted(userId, mailAccountId, gmailMessageId) {
      const id = mailMessagesByGmail.get(
        mailMessageKey(userId, mailAccountId, gmailMessageId),
      );
      if (!id) return;
      const msg = mailMessages.get(id);
      if (!msg || msg.userId !== userId) return;
      mailMessages.set(id, {
        ...msg,
        processingStatus: "deleted",
      });
    },
  };

  const receiptRepo: ReceiptRepository = {
    async create(receipt) {
      receipts.set(receipt.id, receipt);
    },
    async findById(userId, id) {
      const receipt = receipts.get(id);
      return receipt && receipt.userId === userId ? receipt : null;
    },
    async findByMailMessageId(userId, mailMessageId) {
      return (
        [...receipts.values()].find(
          (r) => r.userId === userId && r.mailMessageId === mailMessageId,
        ) ?? null
      );
    },
    async listUnmatchedInWindow(userId, start, end) {
      const linked = new Set(
        [...receiptLinksByReceipt.values()]
          .filter((l) => l.userId === userId)
          .map((l) => l.receiptId),
      );
      return [...receipts.values()].filter(
        (r) =>
          r.userId === userId &&
          !linked.has(r.id) &&
          r.extractedAt >= start &&
          r.extractedAt < end,
      );
    },
  };

  const receiptLinkRepo: TransactionReceiptLinkRepository = {
    async link(entry) {
      const txnKey = `${entry.userId}:${entry.transactionId}`;
      const receiptKey = `${entry.userId}:${entry.receiptId}`;
      if (receiptLinksByTxn.has(txnKey)) {
        throw new InvariantError(
          `transaction ${entry.transactionId} already linked to a receipt`,
        );
      }
      if (receiptLinksByReceipt.has(receiptKey)) {
        throw new InvariantError(
          `receipt ${entry.receiptId} already linked to a transaction`,
        );
      }
      receiptLinksByTxn.set(txnKey, entry);
      receiptLinksByReceipt.set(receiptKey, entry);
    },
    async findByTransactionId(userId, transactionId) {
      return receiptLinksByTxn.get(`${userId}:${transactionId}`) ?? null;
    },
    async findByReceiptId(userId, receiptId) {
      return receiptLinksByReceipt.get(`${userId}:${receiptId}`) ?? null;
    },
  };

  return {
    users: userRepo,
    items: itemRepo,
    accounts: accountRepo,
    transactions: txnRepo,
    merchants: merchantRepo,
    baselines: baselineRepo,
    digests: digestRepo,
    reports: reportRepo,
    anomalies: anomalyRepo,
    mailAccounts: mailAccountRepo,
    mailMessages: mailMessageRepo,
    receipts: receiptRepo,
    transactionReceiptLinks: receiptLinkRepo,
    /** Test-only seed helpers */
    _seed: {
      user(u: User) {
        users.set(u.id, u);
      },
      item(item: Item, token: string) {
        items.set(item.id, item);
        itemTokens.set(item.id, token);
        itemsByPlaid.set(item.plaidItemId, item.id);
      },
      account(acct: Account) {
        accountsByPlaid.set(acct.plaidAccountId, acct);
      },
      transaction(t: Transaction) {
        txnsByPlaid.set(t.plaidTransactionId, t);
        txnsById.set(t.id, t);
      },
      mailAccount(account: MailAccount, refreshToken: string) {
        mailAccounts.set(account.id, account);
        mailRefreshTokens.set(account.id, refreshToken);
        mailAccountsByGmail.set(account.gmailAddress.toLowerCase(), account.id);
      },
      mailMessage(message: MailMessage) {
        mailMessages.set(message.id, message);
        mailMessagesByGmail.set(
          mailMessageKey(
            message.userId,
            message.mailAccountId,
            message.gmailMessageId,
          ),
          message.id,
        );
      },
      receipt(receipt: Receipt) {
        receipts.set(receipt.id, receipt);
      },
      receiptLink(link: TransactionReceiptLink) {
        receiptLinksByTxn.set(`${link.userId}:${link.transactionId}`, link);
        receiptLinksByReceipt.set(`${link.userId}:${link.receiptId}`, link);
      },
    },
    listMailMessagesForUser(userId: UserId) {
      return [...mailMessages.values()].filter((message) => message.userId === userId);
    },
    listReceiptsForUser(userId: UserId) {
      return [...receipts.values()].filter((receipt) => receipt.userId === userId);
    },
  } satisfies TestRepositories;
}

function mailMessageKey(
  userId: UserId,
  mailAccountId: MailAccountId,
  gmailMessageId: string,
): string {
  return `${userId}:${mailAccountId}:${gmailMessageId}`;
}

function baselineKey(
  userId: UserId,
  category: Category,
  period: Period,
): string {
  return `${userId}:${category}:${period}`;
}
