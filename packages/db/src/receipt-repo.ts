import type { ReceiptRepository } from "@expense/core";
import type { PrismaClient } from "@prisma/client";
import { receiptCreateData, toReceipt } from "./mappers.js";

export function makeReceiptRepository(prisma: PrismaClient): ReceiptRepository {
  return {
    async create(receipt) {
      await prisma.receipt.create({ data: receiptCreateData(receipt) });
    },

    async findById(userId, id) {
      const row = await prisma.receipt.findFirst({
        where: { id, userId },
      });
      return row ? toReceipt(row) : null;
    },

    async findByMailMessageId(userId, mailMessageId) {
      const row = await prisma.receipt.findFirst({
        where: { mailMessageId, userId },
      });
      return row ? toReceipt(row) : null;
    },

    async listUnmatchedInWindow(userId, start, end) {
      const rows = await prisma.receipt.findMany({
        where: {
          userId,
          extractedAt: { gte: start, lt: end },
          link: null,
        },
      });
      return rows.map(toReceipt);
    },
  };
}
