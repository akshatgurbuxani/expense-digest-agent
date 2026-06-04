import { v7 as uuidv7 } from "uuid";

/**
 * Branded ids prevent passing a `UserId` where an `AccountId` is expected.
 * Our primary keys are UUIDv7 — time-sortable, so they index and sort
 * chronologically. See docs/conventions.md §2.
 */
type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, "UserId">;
export type ItemId = Brand<string, "ItemId">;
export type AccountId = Brand<string, "AccountId">;
export type TransactionId = Brand<string, "TransactionId">;
export type DigestId = Brand<string, "DigestId">;
export type ReportId = Brand<string, "ReportId">;
export type AnomalyId = Brand<string, "AnomalyId">;
export type MailAccountId = Brand<string, "MailAccountId">;
export type MailMessageId = Brand<string, "MailMessageId">;
export type ReceiptId = Brand<string, "ReceiptId">;

export const newId = <B extends string>(): Brand<string, B> =>
  uuidv7() as Brand<string, B>;
