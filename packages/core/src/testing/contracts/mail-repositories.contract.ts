import { describe, it, expect } from "vitest";
import { InvariantError } from "../../errors.js";
import { Money } from "../../money.js";
import { newId } from "../../ids.js";
import type {
  MailAccountRepository,
  MailMessageRepository,
  ReceiptRepository,
  TransactionReceiptLinkRepository,
} from "../../ports/repositories.js";
import type { MailAccountId, MailMessageId, ReceiptId, UserId } from "../../ids.js";
import type { TransactionId } from "../../ids.js";
import type { Receipt } from "../../domain/receipt.js";

export interface MailRepoContractOptions {
  readonly userId?: UserId;
}

export interface MailAccountContractOptions {
  prepare?: (ctx: { userId: UserId }) => void | Promise<void>;
}

export function mailAccountRepositoryContract(
  makeRepo: () => MailAccountRepository,
  label: string,
  options: MailAccountContractOptions = {},
) {
  describe(`MailAccountRepository contract (${label})`, () => {
    it("stores refresh token only inside withRefreshToken", async () => {
      const repo = makeRepo();
      const userId = newId<"UserId">();
      await options.prepare?.({ userId });
      const account = await repo.create(
        { userId, gmailAddress: "user@gmail.com" },
        "secret-refresh",
      );

      const token = await repo.withRefreshToken(account.id, async (t) => t);
      expect(token).toBe("secret-refresh");
      expect(await repo.findByGmailAddress("user@gmail.com")).toMatchObject({
        id: account.id,
      });
    });

    it("findByGmailAddress is case-insensitive", async () => {
      const repo = makeRepo();
      const userId = newId<"UserId">();
      await options.prepare?.({ userId });
      await repo.create({ userId, gmailAddress: "User@gmail.com" }, "token");

      expect(await repo.findByGmailAddress("user@gmail.com")).not.toBeNull();
    });
  });
}

export interface MailMessageContractOptions {
  prepare?: (ctx: {
    userId: UserId;
    mailAccountId: MailAccountId;
  }) => void | Promise<void>;
}

export function mailMessageRepositoryContract(
  makeRepo: () => MailMessageRepository,
  label: string,
  options: MailMessageContractOptions = {},
) {
  describe(`MailMessageRepository contract (${label})`, () => {
    it("upserts idempotently by gmailMessageId", async () => {
      const repo = makeRepo();
      const userId = newId<"UserId">();
      const mailAccountId = newId<"MailAccountId">();
      await options.prepare?.({ userId, mailAccountId });
      const input = {
        userId,
        mailAccountId,
        gmailMessageId: "gmail-msg-1",
        threadId: "thread-1",
        receivedAt: new Date("2026-05-20T18:00:00.000Z"),
        fromAddress: "shop@store.com",
        fromDomain: "store.com",
        subject: "Receipt",
      };

      const first = await repo.upsertSeen(input);
      const second = await repo.upsertSeen(input);
      expect(second.id).toBe(first.id);
    });

    it("scopes reads by userId", async () => {
      const repo = makeRepo();
      const userA = newId<"UserId">();
      const userB = newId<"UserId">();
      const mailAccountId = newId<"MailAccountId">();
      await options.prepare?.({ userId: userA, mailAccountId });
      const msg = await repo.upsertSeen({
        userId: userA,
        mailAccountId,
        gmailMessageId: "gmail-msg-2",
        threadId: "thread-2",
        receivedAt: new Date("2026-05-20T18:00:00.000Z"),
        fromAddress: "shop@store.com",
        fromDomain: "store.com",
        subject: "Receipt",
      });

      expect(await repo.findById(userA, msg.id)).not.toBeNull();
      expect(await repo.findById(userB, msg.id)).toBeNull();
    });
  });
}

export interface ReceiptContractOptions {
  prepare?: (ctx: {
    userId: UserId;
    mailMessageId: MailMessageId;
  }) => void | Promise<void>;
}

export function receiptRepositoryContract(
  makeRepo: () => ReceiptRepository,
  label: string,
  options: ReceiptContractOptions = {},
) {
  describe(`ReceiptRepository contract (${label})`, () => {
    it("finds receipt by mail message id for the correct tenant", async () => {
      const repo = makeRepo();
      const userId = newId<"UserId">();
      const mailMessageId = newId<"MailMessageId">();
      await options.prepare?.({ userId, mailMessageId });
      const receipt = sampleReceipt(userId, mailMessageId);
      await repo.create(receipt);

      const found = await repo.findByMailMessageId(userId, mailMessageId);
      expect(found?.id).toBe(receipt.id);
      expect(
        await repo.findByMailMessageId(newId<"UserId">(), mailMessageId),
      ).toBeNull();
    });
  });
}

export interface TransactionReceiptLinkContractOptions {
  prepare?: (ctx: {
    userId: UserId;
    transactionId: TransactionId;
    receiptId: ReceiptId;
    mailMessageId: MailMessageId;
  }) => void | Promise<void>;
}

export function transactionReceiptLinkRepositoryContract(
  makeRepo: () => TransactionReceiptLinkRepository,
  label: string,
  options: TransactionReceiptLinkContractOptions = {},
) {
  describe(`TransactionReceiptLinkRepository contract (${label})`, () => {
    it("enforces one link per transaction and per receipt", async () => {
      const repo = makeRepo();
      const userId = newId<"UserId">();
      const txnA = newId<"TransactionId">();
      const txnB = newId<"TransactionId">();
      const receiptA = newId<"ReceiptId">();
      const receiptB = newId<"ReceiptId">();
      const mailMessageA = newId<"MailMessageId">();
      const mailMessageB = newId<"MailMessageId">();

      await options.prepare?.({
        userId,
        transactionId: txnA,
        receiptId: receiptA,
        mailMessageId: mailMessageA,
      });
      await repo.link(link(userId, txnA, receiptA));
      await options.prepare?.({
        userId,
        transactionId: txnA,
        receiptId: receiptB,
        mailMessageId: mailMessageB,
      });
      await expect(repo.link(link(userId, txnA, receiptB))).rejects.toBeInstanceOf(
        InvariantError,
      );
      await options.prepare?.({
        userId,
        transactionId: txnB,
        receiptId: receiptA,
        mailMessageId: mailMessageA,
      });
      await expect(repo.link(link(userId, txnB, receiptA))).rejects.toBeInstanceOf(
        InvariantError,
      );
    });
  });
}

function sampleReceipt(userId: UserId, mailMessageId: MailMessageId): Receipt {
  return {
    id: newId<"ReceiptId">(),
    userId,
    mailMessageId,
    kind: "order_confirmation",
    merchantName: "Amazon",
    merchantDomain: "amazon.com",
    orderId: "123",
    orderUrl: null,
    totalAmount: Money.of(4599, "USD"),
    occurredAt: new Date("2026-05-20T18:00:00.000Z"),
    lineItems: [],
    extractedAt: new Date("2026-05-20T18:05:00.000Z"),
    extractionSource: "heuristic",
    confidence: 0.9,
  };
}

function link(
  userId: UserId,
  transactionId: import("../../ids.js").TransactionId,
  receiptId: ReceiptId,
) {
  return {
    userId,
    transactionId,
    receiptId,
    matchScore: 85,
    matchReason: "exactAmount(+40), merchantFuzzy(+20)",
    linkedAt: new Date("2026-05-21T00:00:00.000Z"),
  };
}
