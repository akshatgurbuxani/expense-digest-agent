import { NotFoundError } from "@expense/core";
import type { Transaction, TransactionId } from "@expense/core";
import type { TransactionRepository } from "@expense/core";
import type { PrismaClient } from "@prisma/client";
import {
  enrichmentUpdateData,
  toTransaction,
  transactionCreateData,
} from "./mappers.js";

export function makeTransactionRepository(
  prisma: PrismaClient,
): TransactionRepository {
  return {
    async upsertMany(userId, txns) {
      const insertedIds: TransactionId[] = [];

      for (const txn of txns) {
        if (txn.userId !== userId) {
          throw new InvariantError("tenant mismatch on upsert");
        }

        const existing = await prisma.transaction.findUnique({
          where: { plaidTransactionId: txn.plaidTransactionId },
        });

        if (!existing) {
          insertedIds.push(txn.id);
          await prisma.transaction.create({
            data: transactionCreateData(txn),
          });
        }
        // Existing plaid_transaction_id: no-op (sync idempotency).
      }

      return { insertedIds };
    },

    async softDeleteByPlaidIds(userId, plaidIds, removedAt) {
      const ts = removedAt ?? new Date();
      await prisma.transaction.updateMany({
        where: {
          userId,
          plaidTransactionId: { in: plaidIds },
        },
        data: { removedAt: ts },
      });
    },

    async findById(userId, id) {
      const row = await prisma.transaction.findFirst({
        where: { id, userId },
      });
      return row ? toTransaction(row) : null;
    },

    async saveEnrichment(userId, id, enrichment) {
      const result = await prisma.transaction.updateMany({
        where: { id, userId },
        data: enrichmentUpdateData(enrichment),
      });
      if (result.count === 0) {
        throw new NotFoundError(`transaction ${id}`);
      }
    },

    async listForUser(userId) {
      const rows = await prisma.transaction.findMany({
        where: { userId, removedAt: null },
      });
      return rows.map(toTransaction);
    },

    async listInWindow(userId, start, end) {
      const rows = await prisma.transaction.findMany({
        where: {
          userId,
          removedAt: null,
          occurredAt: { gte: start, lt: end },
        },
      });
      return rows.map(toTransaction);
    },

    async recentForMerchant(userId, merchant, since) {
      const needle = merchant.toLowerCase();
      const rows = await prisma.transaction.findMany({
        where: {
          userId,
          removedAt: null,
          occurredAt: { gte: since },
        },
      });
      return rows
        .map(toTransaction)
        .filter((t: Transaction) =>
          (t.merchantName ?? t.merchantNameRaw).toLowerCase().includes(needle),
        );
    },
  };
}
