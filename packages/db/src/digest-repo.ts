import { NotFoundError } from "@expense/core";
import type { DigestId } from "@expense/core";
import type { DigestRepository } from "@expense/core";
import type { PrismaClient } from "@prisma/client";
import { digestCreateData, toDigest } from "./mappers.js";

export function makeDigestRepository(prisma: PrismaClient): DigestRepository {
  return {
    async create(digest) {
      await prisma.digest.create({ data: digestCreateData(digest) });
    },

    async markDelivered(id: DigestId, at) {
      try {
        await prisma.digest.update({
          where: { id },
          data: { deliveredAt: at },
        });
      } catch {
        throw new NotFoundError(`digest ${id}`);
      }
    },

    async history(userId, limit) {
      const rows = await prisma.digest.findMany({
        where: { userId },
        orderBy: { weekStart: "asc" },
        take: limit,
      });
      return rows.map(toDigest);
    },
  };
}
