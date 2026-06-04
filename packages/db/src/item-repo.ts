import { NotFoundError, newId } from "@expense/core";
import type { Crypto } from "@expense/core";
import type { ItemId } from "@expense/core";
import type { ItemRepository } from "@expense/core";
import type { PrismaClient } from "@prisma/client";
import { toItem } from "./mappers.js";

export function makeItemRepository(
  prisma: PrismaClient,
  crypto: Crypto,
): ItemRepository {
  return {
    async create(newItem, accessTokenPlaintext) {
      const row = await prisma.plaidItem.create({
        data: {
          id: newId<"ItemId">(),
          userId: newItem.userId,
          plaidItemId: newItem.plaidItemId,
          accessTokenEncrypted: crypto.encrypt(accessTokenPlaintext),
          status: "good",
        },
      });
      return toItem(row);
    },

    async findById(id) {
      const row = await prisma.plaidItem.findUnique({ where: { id } });
      return row ? toItem(row) : null;
    },

    async findByPlaidItemId(plaidItemId) {
      const row = await prisma.plaidItem.findUnique({ where: { plaidItemId } });
      return row ? toItem(row) : null;
    },

    async listByUserId(userId) {
      const rows = await prisma.plaidItem.findMany({ where: { userId } });
      return rows.map(toItem);
    },

    async withAccessToken(id: ItemId, fn) {
      const row = await prisma.plaidItem.findUnique({ where: { id } });
      if (!row) throw new NotFoundError(`item ${id}`);
      const token = crypto.decrypt(row.accessTokenEncrypted);
      return fn(token);
    },

    async saveCursor(id, cursor, syncedAt) {
      try {
        await prisma.plaidItem.update({
          where: { id },
          data: { syncCursor: cursor, lastSyncedAt: syncedAt },
        });
      } catch {
        throw new NotFoundError(`item ${id}`);
      }
    },

    async setStatus(id, status) {
      try {
        await prisma.plaidItem.update({
          where: { id },
          data: { status },
        });
      } catch {
        throw new NotFoundError(`item ${id}`);
      }
    },
  };
}
