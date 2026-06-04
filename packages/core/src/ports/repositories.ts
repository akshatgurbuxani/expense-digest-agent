import type {
  AnomalyId,
  DigestId,
  ItemId,
  MailAccountId,
  MailMessageId,
  ReceiptId,
  ReportId,
  TransactionId,
  UserId,
} from "../ids.js";
import type { Account } from "../domain/account.js";
import type { Anomaly } from "../domain/anomaly.js";
import type { SpendBaseline } from "../domain/baseline.js";
import type { Category } from "../domain/category.js";
import type { Digest } from "../domain/digest.js";
import type { MonthlyReport } from "../domain/monthly-report.js";
import type { MerchantSignals } from "../domain/merchant-signals.js";
import type { Item, ItemStatus } from "../domain/item.js";
import type { Transaction } from "../domain/transaction.js";
import type {
  DeliveryPreference,
  User,
  Weekday,
} from "../domain/user.js";
import type { MailAccount, MailAccountStatus } from "../domain/mail-account.js";
import type { MailMessage, MailProcessingStatus } from "../domain/mail-message.js";
import type { Receipt } from "../domain/receipt.js";
import type { ReceiptKind } from "../domain/receipt-kind.js";
import type { TransactionReceiptLink } from "../domain/transaction-receipt-link.js";

export type Period = "weekly" | "monthly";

export interface UserPreferences {
  readonly timezone?: string;
  readonly digestDay?: Weekday;
  readonly digestTime?: string;
  readonly deliveryPreference?: DeliveryPreference;
}

export interface NewItem {
  readonly userId: UserId;
  readonly plaidItemId: string;
}

export interface Enrichment {
  readonly merchantName: string;
  readonly category: Category;
  readonly isSubscription: boolean;
  readonly isRecurring: boolean;
  readonly enrichedAt: Date;
}

export interface CachedMerchant {
  readonly normalizedMerchant: string;
  readonly merchantName: string;
  readonly category: Category;
  readonly signals: MerchantSignals;
  readonly source: "plaid" | "llm";
}

export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findDueForDigest(at: Date): Promise<User[]>;
  findDueForMonthlyReport(
    at: Date,
    schedule: import("../report-schedule.js").ReportScheduleConfig,
  ): Promise<User[]>;
  updatePreferences(id: UserId, prefs: UserPreferences): Promise<void>;
}

export interface ItemRepository {
  create(item: NewItem, accessTokenPlaintext: string): Promise<Item>;
  findById(id: ItemId): Promise<Item | null>;
  findByPlaidItemId(plaidItemId: string): Promise<Item | null>;
  listByUserId(userId: UserId): Promise<Item[]>;
  withAccessToken<T>(id: ItemId, fn: (token: string) => Promise<T>): Promise<T>;
  saveCursor(id: ItemId, cursor: string, syncedAt: Date): Promise<void>;
  setStatus(id: ItemId, status: ItemStatus): Promise<void>;
}

export interface TransactionRepository {
  upsertMany(
    userId: UserId,
    txns: Transaction[],
  ): Promise<{ insertedIds: TransactionId[] }>;
  softDeleteByPlaidIds(userId: UserId, plaidIds: string[], removedAt?: Date): Promise<void>;
  findById(
    userId: UserId,
    id: TransactionId,
  ): Promise<Transaction | null>;
  saveEnrichment(
    userId: UserId,
    id: TransactionId,
    enrichment: Enrichment,
  ): Promise<void>;
  listForUser(userId: UserId): Promise<Transaction[]>;
  listInWindow(
    userId: UserId,
    start: Date,
    end: Date,
  ): Promise<Transaction[]>;
  recentForMerchant(
    userId: UserId,
    merchant: string,
    since: Date,
  ): Promise<Transaction[]>;
}

export interface MerchantCategoryRepository {
  lookup(normalizedMerchant: string): Promise<CachedMerchant | null>;
  upsert(entry: CachedMerchant): Promise<void>;
}

export interface BaselineRepository {
  get(
    userId: UserId,
    category: Category,
    period: Period,
  ): Promise<SpendBaseline | null>;
  getAll(userId: UserId, period: Period): Promise<SpendBaseline[]>;
  upsertMany(userId: UserId, baselines: SpendBaseline[]): Promise<void>;
}

export interface DigestRepository {
  create(digest: Digest): Promise<void>;
  markDelivered(id: DigestId, at: Date): Promise<void>;
  history(userId: UserId, limit: number): Promise<Digest[]>;
}

export interface ReportRepository {
  create(report: MonthlyReport): Promise<void>;
  markDelivered(id: ReportId, at: Date): Promise<void>;
  findById(userId: UserId, id: ReportId): Promise<MonthlyReport | null>;
  findByYearMonth(
    userId: UserId,
    yearMonth: string,
  ): Promise<MonthlyReport | null>;
}

export interface AccountRepository {
  findByPlaidAccountId(
    userId: UserId,
    plaidAccountId: string,
  ): Promise<Account | null>;
}

export interface AnomalyRepository {
  create(anomaly: Anomaly): Promise<void>;
  markDelivered(id: AnomalyId, at: Date): Promise<void>;
  listUndeliveredInWindow(
    userId: UserId,
    start: Date,
    end: Date,
  ): Promise<Anomaly[]>;
  listRecent(userId: UserId, limit: number): Promise<Anomaly[]>;
}

export interface NewMailAccount {
  readonly userId: UserId;
  readonly gmailAddress: string;
}

export interface MailAccountRepository {
  create(
    account: NewMailAccount,
    refreshTokenPlaintext: string,
  ): Promise<MailAccount>;
  findById(id: MailAccountId): Promise<MailAccount | null>;
  findByUserId(userId: UserId): Promise<MailAccount | null>;
  findByGmailAddress(gmailAddress: string): Promise<MailAccount | null>;
  listActive(): Promise<readonly MailAccount[]>;
  withRefreshToken<T>(
    id: MailAccountId,
    fn: (refreshToken: string) => Promise<T>,
  ): Promise<T>;
  saveRefreshToken(
    id: MailAccountId,
    refreshTokenPlaintext: string,
  ): Promise<void>;
  saveHistoryId(
    id: MailAccountId,
    historyId: string,
    syncedAt: Date,
  ): Promise<void>;
  saveWatchExpiration(
    id: MailAccountId,
    expiresAt: Date,
    historyId: string,
  ): Promise<void>;
  setStatus(id: MailAccountId, status: MailAccountStatus): Promise<void>;
}

export interface UpsertMailMessage {
  readonly userId: UserId;
  readonly mailAccountId: MailAccountId;
  readonly gmailMessageId: string;
  readonly threadId: string;
  readonly receivedAt: Date;
  readonly fromAddress: string;
  readonly fromDomain: string;
  readonly subject: string;
}

export interface MailMessageClassificationUpdate {
  readonly processingStatus: MailProcessingStatus;
  readonly receiptKind: ReceiptKind | null;
  readonly ignoreReason: string | null;
}

export interface MailMessageRepository {
  findByGmailMessageId(
    userId: UserId,
    mailAccountId: MailAccountId,
    gmailMessageId: string,
  ): Promise<MailMessage | null>;
  findById(userId: UserId, id: MailMessageId): Promise<MailMessage | null>;
  upsertSeen(input: UpsertMailMessage): Promise<MailMessage>;
  updateClassification(
    userId: UserId,
    id: MailMessageId,
    update: MailMessageClassificationUpdate,
  ): Promise<void>;
  markDeleted(
    userId: UserId,
    mailAccountId: MailAccountId,
    gmailMessageId: string,
  ): Promise<void>;
}

export interface ReceiptRepository {
  create(receipt: Receipt): Promise<void>;
  findById(userId: UserId, id: ReceiptId): Promise<Receipt | null>;
  findByMailMessageId(
    userId: UserId,
    mailMessageId: MailMessageId,
  ): Promise<Receipt | null>;
  listUnmatchedInWindow(
    userId: UserId,
    start: Date,
    end: Date,
  ): Promise<Receipt[]>;
}

export interface TransactionReceiptLinkRepository {
  link(entry: TransactionReceiptLink): Promise<void>;
  findByTransactionId(
    userId: UserId,
    transactionId: TransactionId,
  ): Promise<TransactionReceiptLink | null>;
  findByReceiptId(
    userId: UserId,
    receiptId: ReceiptId,
  ): Promise<TransactionReceiptLink | null>;
}

export interface Repositories {
  users: UserRepository;
  items: ItemRepository;
  accounts: AccountRepository;
  transactions: TransactionRepository;
  merchants: MerchantCategoryRepository;
  baselines: BaselineRepository;
  digests: DigestRepository;
  reports: ReportRepository;
  anomalies: AnomalyRepository;
  mailAccounts: MailAccountRepository;
  mailMessages: MailMessageRepository;
  receipts: ReceiptRepository;
  transactionReceiptLinks: TransactionReceiptLinkRepository;
}
