import { NotFoundError, newId } from "@expense/core";
import type { MailMessageRepository } from "@expense/core";
import type { PrismaClient } from "@prisma/client";
import { mailMessageCreateData, toMailMessage } from "./mappers.js";

export function makeMailMessageRepository(
  prisma: PrismaClient,
): MailMessageRepository {
  return {
    async findByGmailMessageId(userId, mailAccountId, gmailMessageId) {
      const row = await prisma.mailMessage.findUnique({
        where: {
          mailAccountId_gmailMessageId: { mailAccountId, gmailMessageId },
        },
      });
      return row && row.userId === userId ? toMailMessage(row) : null;
    },

    async findById(userId, id) {
      const row = await prisma.mailMessage.findFirst({
        where: { id, userId },
      });
      return row ? toMailMessage(row) : null;
    },

    async upsertSeen(input) {
      const existing = await prisma.mailMessage.findUnique({
        where: {
          mailAccountId_gmailMessageId: {
            mailAccountId: input.mailAccountId,
            gmailMessageId: input.gmailMessageId,
          },
        },
      });
      if (existing) {
        return toMailMessage(existing);
      }

      const row = await prisma.mailMessage.create({
        data: mailMessageCreateData(input, newId<"MailMessageId">()),
      });
      return toMailMessage(row);
    },

    async updateClassification(userId, id, update) {
      const result = await prisma.mailMessage.updateMany({
        where: { id, userId },
        data: {
          processingStatus: update.processingStatus,
          receiptKind: update.receiptKind,
          ignoreReason: update.ignoreReason,
        },
      });
      if (result.count === 0) {
        throw new NotFoundError(`mail message ${id}`);
      }
    },

    async markDeleted(userId, mailAccountId, gmailMessageId) {
      const row = await prisma.mailMessage.findUnique({
        where: {
          mailAccountId_gmailMessageId: { mailAccountId, gmailMessageId },
        },
      });
      if (!row || row.userId !== userId) return;

      await prisma.mailMessage.update({
        where: { id: row.id },
        data: { processingStatus: "deleted" },
      });
    },
  };
}
