import type { UserId } from "@expense/core";
import type { BaselineRepository } from "@expense/core";
import type { PrismaClient } from "@prisma/client";
import { baselineUpsertData, toBaseline } from "./mappers.js";

export function makeBaselineRepository(prisma: PrismaClient): BaselineRepository {
  return {
    async get(userId, category, period) {
      const row = await prisma.spendBaseline.findUnique({
        where: {
          userId_category_period: { userId, category, period },
        },
      });
      return row ? toBaseline(row) : null;
    },

    async getAll(userId, period) {
      const rows = await prisma.spendBaseline.findMany({
        where: { userId, period },
      });
      return rows.map(toBaseline);
    },

    async upsertMany(userId: UserId, baselines) {
      for (const b of baselines) {
        if (b.userId !== userId) {
          throw new InvariantError("tenant mismatch on baseline");
        }
        const data = baselineUpsertData(b);
        await prisma.spendBaseline.upsert({
          where: {
            userId_category_period: {
              userId,
              category: b.category,
              period: b.period,
            },
          },
          create: data,
          update: data,
        });
      }
    },
  };
}
