import { InvariantError } from "@expense/core";
import type { TransactionReceiptLinkRepository } from "@expense/core";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  toTransactionReceiptLink,
  transactionReceiptLinkCreateData,
} from "./mappers.js";

export function makeTransactionReceiptLinkRepository(
  prisma: PrismaClient,
): TransactionReceiptLinkRepository {
  return {
    async link(entry) {
      try {
        await prisma.transactionReceiptLink.create({
          data: transactionReceiptLinkCreateData(entry),
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new InvariantError(
            `transaction ${entry.transactionId} or receipt ${entry.receiptId} already linked`,
          );
        }
        throw error;
      }
    },

    async findByTransactionId(userId, transactionId) {
      const row = await prisma.transactionReceiptLink.findFirst({
        where: { userId, transactionId },
      });
      return row ? toTransactionReceiptLink(row) : null;
    },

    async findByReceiptId(userId, receiptId) {
      const row = await prisma.transactionReceiptLink.findFirst({
        where: { userId, receiptId },
      });
      return row ? toTransactionReceiptLink(row) : null;
    },
  };
}
