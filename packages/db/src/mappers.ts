import {
  CATEGORIES,
  type Category,
  type CurrencyCode,
  Money,
  type Account,
  type Anomaly,
  type AnomalyReason,
  type Digest,
  type DigestFacts,
  type MonthlyReport,
  type MonthlyReportFacts,
  type Item,
  type ItemStatus,
  type MerchantSignals,
  type Severity,
  type SpendBaseline,
  type Transaction,
  type User,
  type Weekday,
  type DeliveryPreference,
  InvariantError,
  RECEIPT_KINDS,
  type ReceiptKind,
  type MailAccount,
  type MailAccountStatus,
  type MailMessage,
  type MailProcessingStatus,
  type Receipt,
  type ReceiptLineItem,
  type TransactionReceiptLink,
} from "@expense/core";
import type { Prisma } from "@prisma/client";
import type {
  Account as AccountRow,
  Anomaly as AnomalyRow,
  Digest as DigestRow,
  MonthlyReport as MonthlyReportRow,
  MerchantCategory as MerchantRow,
  PlaidItem as ItemRow,
  SpendBaseline as BaselineRow,
  Transaction as TransactionRow,
  User as UserRow,
  MailAccount as MailAccountRow,
  MailMessage as MailMessageRow,
  Receipt as ReceiptRow,
  TransactionReceiptLink as TransactionReceiptLinkRow,
} from "@prisma/client";
import type { CachedMerchant, Enrichment, Period } from "@expense/core";

export function toUser(row: UserRow): User {
  return {
    id: row.id as User["id"],
    email: row.email,
    timezone: row.timezone,
    digestDay: row.digestDay as Weekday,
    digestTime: row.digestTime,
    deliveryPreference: row.deliveryPreference as DeliveryPreference,
    createdAt: row.createdAt,
  };
}

export function toItem(row: ItemRow): Item {
  return {
    id: row.id as Item["id"],
    userId: row.userId as Item["userId"],
    plaidItemId: row.plaidItemId,
    status: row.status as ItemStatus,
    syncCursor: row.syncCursor,
    lastSyncedAt: row.lastSyncedAt,
  };
}

export function toAccount(row: AccountRow): Account {
  return {
    id: row.id as Account["id"],
    itemId: row.itemId as Account["itemId"],
    userId: row.userId as Account["userId"],
    plaidAccountId: row.plaidAccountId,
    name: row.name,
    type: row.type,
    lastSyncedAt: row.lastSyncedAt,
  };
}

export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id as Transaction["id"],
    accountId: row.accountId as Transaction["accountId"],
    userId: row.userId as Transaction["userId"],
    plaidTransactionId: row.plaidTransactionId,
    amount: Money.of(row.amountMinorUnits, row.currency as CurrencyCode),
    merchantNameRaw: row.merchantNameRaw,
    merchantName: row.merchantName,
    category: row.category ? parseCategory(row.category) : null,
    plaidPfc: row.plaidPfc,
    isSubscription: row.isSubscription,
    isRecurring: row.isRecurring,
    occurredAt: row.occurredAt,
    enrichedAt: row.enrichedAt,
    removedAt: row.removedAt,
  };
}

export function transactionCreateData(txn: Transaction) {
  return {
    id: txn.id,
    accountId: txn.accountId,
    userId: txn.userId,
    plaidTransactionId: txn.plaidTransactionId,
    amountMinorUnits: txn.amount.minorUnits,
    currency: txn.amount.currency,
    merchantNameRaw: txn.merchantNameRaw,
    merchantName: txn.merchantName,
    category: txn.category,
    plaidPfc: txn.plaidPfc,
    isSubscription: txn.isSubscription,
    isRecurring: txn.isRecurring,
    occurredAt: txn.occurredAt,
    enrichedAt: txn.enrichedAt,
    removedAt: txn.removedAt,
  };
}

export function transactionUpdateData(txn: Transaction) {
  return {
    accountId: txn.accountId,
    userId: txn.userId,
    amountMinorUnits: txn.amount.minorUnits,
    currency: txn.amount.currency,
    merchantNameRaw: txn.merchantNameRaw,
    merchantName: txn.merchantName,
    category: txn.category,
    plaidPfc: txn.plaidPfc,
    isSubscription: txn.isSubscription,
    isRecurring: txn.isRecurring,
    occurredAt: txn.occurredAt,
    enrichedAt: txn.enrichedAt,
    removedAt: txn.removedAt,
  };
}

export function enrichmentUpdateData(e: Enrichment) {
  return {
    merchantName: e.merchantName,
    category: e.category,
    isSubscription: e.isSubscription,
    isRecurring: e.isRecurring,
    enrichedAt: e.enrichedAt,
  };
}

export function toCachedMerchant(row: MerchantRow): CachedMerchant {
  const signals = row.signalsJson as unknown as MerchantSignals;
  return {
    normalizedMerchant: row.normalizedMerchant,
    merchantName: row.merchantName,
    category: parseCategory(row.category),
    signals,
    source: row.source as CachedMerchant["source"],
  };
}

export function merchantUpsertData(entry: CachedMerchant) {
  return {
    normalizedMerchant: entry.normalizedMerchant,
    merchantName: entry.merchantName,
    category: entry.category,
    signalsJson: entry.signals as unknown as Prisma.InputJsonValue,
    source: entry.source,
  };
}

export function toBaseline(row: BaselineRow): SpendBaseline {
  const currency = row.currency as CurrencyCode;
  return {
    userId: row.userId as SpendBaseline["userId"],
    category: parseCategory(row.category),
    period: row.period as Period,
    mean: Money.of(row.meanMinorUnits, currency),
    median: Money.of(row.medianMinorUnits, currency),
    stddevMinorUnits: row.stddevMinorUnits,
    sampleCount: row.sampleCount,
    computedAt: row.computedAt,
  };
}

export function baselineUpsertData(b: SpendBaseline) {
  return {
    userId: b.userId,
    category: b.category,
    period: b.period,
    meanMinorUnits: b.mean.minorUnits,
    medianMinorUnits: b.median.minorUnits,
    currency: b.mean.currency,
    stddevMinorUnits: b.stddevMinorUnits,
    sampleCount: b.sampleCount,
    computedAt: b.computedAt,
  };
}

export function toDigest(row: DigestRow): Digest {
  return {
    id: row.id as Digest["id"],
    userId: row.userId as Digest["userId"],
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    facts: row.factsJson as unknown as DigestFacts,
    subject: row.subject,
    content: row.content,
    deliveredAt: row.deliveredAt,
  };
}

export function digestCreateData(d: Digest) {
  return {
    id: d.id,
    userId: d.userId,
    weekStart: d.weekStart,
    weekEnd: d.weekEnd,
    factsJson: d.facts as unknown as Prisma.InputJsonValue,
    subject: d.subject,
    content: d.content,
    deliveredAt: d.deliveredAt,
  };
}

export function toMonthlyReport(row: MonthlyReportRow): MonthlyReport {
  return {
    id: row.id as MonthlyReport["id"],
    userId: row.userId as MonthlyReport["userId"],
    yearMonth: row.yearMonth,
    monthStart: row.monthStart,
    monthEnd: row.monthEnd,
    facts: row.factsJson as unknown as MonthlyReportFacts,
    subject: row.subject,
    content: row.content,
    deliveredAt: row.deliveredAt,
  };
}

export function monthlyReportCreateData(report: MonthlyReport) {
  return {
    id: report.id,
    userId: report.userId,
    yearMonth: report.yearMonth,
    monthStart: report.monthStart,
    monthEnd: report.monthEnd,
    factsJson: report.facts as unknown as Prisma.InputJsonValue,
    subject: report.subject,
    content: report.content,
    deliveredAt: report.deliveredAt,
  };
}

export function toAnomaly(row: AnomalyRow): Anomaly {
  return {
    id: row.id as Anomaly["id"],
    userId: row.userId as Anomaly["userId"],
    transactionId: row.transactionId as Anomaly["transactionId"],
    reason: row.reason as AnomalyReason,
    severity: row.severity as Severity,
    detail: row.detail,
    detectedAt: row.detectedAt,
    deliveredAt: row.deliveredAt,
  };
}

export function anomalyCreateData(a: Anomaly) {
  return {
    id: a.id,
    userId: a.userId,
    transactionId: a.transactionId,
    reason: a.reason,
    severity: a.severity,
    detail: a.detail,
    detectedAt: a.detectedAt,
    deliveredAt: a.deliveredAt,
  };
}

function parseCategory(value: string): Category {
  if (!(CATEGORIES as readonly string[]).includes(value)) {
    throw new InvariantError(`invalid category in database: ${value}`);
  }
  return value as Category;
}

export function toMailAccount(row: MailAccountRow): MailAccount {
  return {
    id: row.id as MailAccount["id"],
    userId: row.userId as MailAccount["userId"],
    gmailAddress: row.gmailAddress,
    status: row.status as MailAccountStatus,
    historyId: row.historyId,
    watchExpiresAt: row.watchExpiresAt,
    lastSyncedAt: row.lastSyncedAt,
    connectedAt: row.connectedAt,
  };
}

export function toMailMessage(row: MailMessageRow): MailMessage {
  return {
    id: row.id as MailMessage["id"],
    userId: row.userId as MailMessage["userId"],
    mailAccountId: row.mailAccountId as MailMessage["mailAccountId"],
    gmailMessageId: row.gmailMessageId,
    threadId: row.threadId,
    receivedAt: row.receivedAt,
    fromAddress: row.fromAddress,
    fromDomain: row.fromDomain,
    subject: row.subject,
    processingStatus: row.processingStatus as MailProcessingStatus,
    ignoreReason: row.ignoreReason,
    receiptKind: row.receiptKind ? parseReceiptKind(row.receiptKind) : null,
  };
}

export function mailMessageCreateData(
  input: import("@expense/core").UpsertMailMessage,
  id: MailMessage["id"],
) {
  return {
    id,
    userId: input.userId,
    mailAccountId: input.mailAccountId,
    gmailMessageId: input.gmailMessageId,
    threadId: input.threadId,
    receivedAt: input.receivedAt,
    fromAddress: input.fromAddress,
    fromDomain: input.fromDomain,
    subject: input.subject,
    processingStatus: "seen" as const,
    ignoreReason: null,
    receiptKind: null,
  };
}

export function toReceipt(row: ReceiptRow): Receipt {
  const lineItems = row.lineItemsJson as unknown as ReceiptLineItem[];
  return {
    id: row.id as Receipt["id"],
    userId: row.userId as Receipt["userId"],
    mailMessageId: row.mailMessageId as Receipt["mailMessageId"],
    kind: parseReceiptKind(row.kind),
    merchantName: row.merchantName,
    merchantDomain: row.merchantDomain,
    orderId: row.orderId,
    orderUrl: row.orderUrl,
    totalAmount:
      row.totalAmountMinorUnits != null && row.totalAmountCurrency
        ? Money.of(
            row.totalAmountMinorUnits,
            row.totalAmountCurrency as CurrencyCode,
          )
        : null,
    occurredAt: row.occurredAt,
    lineItems,
    extractedAt: row.extractedAt,
    extractionSource: row.extractionSource as Receipt["extractionSource"],
    confidence: row.confidence,
  };
}

export function receiptCreateData(receipt: Receipt) {
  return {
    id: receipt.id,
    userId: receipt.userId,
    mailMessageId: receipt.mailMessageId,
    kind: receipt.kind,
    merchantName: receipt.merchantName,
    merchantDomain: receipt.merchantDomain,
    orderId: receipt.orderId,
    orderUrl: receipt.orderUrl,
    totalAmountMinorUnits: receipt.totalAmount?.minorUnits ?? null,
    totalAmountCurrency: receipt.totalAmount?.currency ?? null,
    occurredAt: receipt.occurredAt,
    lineItemsJson: receipt.lineItems as unknown as Prisma.InputJsonValue,
    extractedAt: receipt.extractedAt,
    extractionSource: receipt.extractionSource,
    confidence: receipt.confidence,
  };
}

export function toTransactionReceiptLink(
  row: TransactionReceiptLinkRow,
): TransactionReceiptLink {
  return {
    userId: row.userId as TransactionReceiptLink["userId"],
    transactionId: row.transactionId as TransactionReceiptLink["transactionId"],
    receiptId: row.receiptId as TransactionReceiptLink["receiptId"],
    matchScore: row.matchScore,
    matchReason: row.matchReason,
    linkedAt: row.linkedAt,
  };
}

export function transactionReceiptLinkCreateData(
  entry: TransactionReceiptLink,
) {
  return {
    userId: entry.userId,
    transactionId: entry.transactionId,
    receiptId: entry.receiptId,
    matchScore: entry.matchScore,
    matchReason: entry.matchReason,
    linkedAt: entry.linkedAt,
  };
}

function parseReceiptKind(value: string): ReceiptKind {
  if (!(RECEIPT_KINDS as readonly string[]).includes(value)) {
    throw new InvariantError(`invalid receipt kind in database: ${value}`);
  }
  return value as ReceiptKind;
}
