import { NotFoundError, newId } from "@expense/core";
import type { Crypto } from "@expense/core";
import type { MailAccountId } from "@expense/core";
import type { MailAccountRepository } from "@expense/core";
import type { PrismaClient } from "@prisma/client";
import { toMailAccount } from "./mappers.js";

export function makeMailAccountRepository(
  prisma: PrismaClient,
  crypto: Crypto,
): MailAccountRepository {
  return {
    async create(newAccount, refreshTokenPlaintext) {
      const row = await prisma.mailAccount.create({
        data: {
          id: newId<"MailAccountId">(),
          userId: newAccount.userId,
          gmailAddress: newAccount.gmailAddress.toLowerCase(),
          refreshTokenEncrypted: crypto.encrypt(refreshTokenPlaintext),
          status: "active",
        },
      });
      return toMailAccount(row);
    },

    async findById(id) {
      const row = await prisma.mailAccount.findUnique({ where: { id } });
      return row ? toMailAccount(row) : null;
    },

    async findByUserId(userId) {
      const row = await prisma.mailAccount.findFirst({ where: { userId } });
      return row ? toMailAccount(row) : null;
    },

    async findByGmailAddress(gmailAddress) {
      const row = await prisma.mailAccount.findUnique({
        where: { gmailAddress: gmailAddress.toLowerCase() },
      });
      return row ? toMailAccount(row) : null;
    },

    async listActive() {
      const rows = await prisma.mailAccount.findMany({
        where: { status: "active" },
      });
      return rows.map(toMailAccount);
    },

    async withRefreshToken(id: MailAccountId, fn) {
      const row = await prisma.mailAccount.findUnique({ where: { id } });
      if (!row) throw new NotFoundError(`mail account ${id}`);
      const token = crypto.decrypt(row.refreshTokenEncrypted);
      return fn(token);
    },

    async saveRefreshToken(id, refreshTokenPlaintext) {
      try {
        await prisma.mailAccount.update({
          where: { id },
          data: {
            refreshTokenEncrypted: crypto.encrypt(refreshTokenPlaintext),
          },
        });
      } catch {
        throw new NotFoundError(`mail account ${id}`);
      }
    },

    async saveHistoryId(id, historyId, syncedAt) {
      try {
        await prisma.mailAccount.update({
          where: { id },
          data: { historyId, lastSyncedAt: syncedAt },
        });
      } catch {
        throw new NotFoundError(`mail account ${id}`);
      }
    },

    async saveWatchExpiration(id, expiresAt, historyId) {
      const row = await prisma.mailAccount.findUnique({ where: { id } });
      if (!row) throw new NotFoundError(`mail account ${id}`);
      await prisma.mailAccount.update({
        where: { id },
        data: {
          watchExpiresAt: expiresAt,
          historyId: row.historyId ?? historyId,
        },
      });
    },

    async setStatus(id, status) {
      try {
        await prisma.mailAccount.update({
          where: { id },
          data: { status },
        });
      } catch {
        throw new NotFoundError(`mail account ${id}`);
      }
    },
  };
}
