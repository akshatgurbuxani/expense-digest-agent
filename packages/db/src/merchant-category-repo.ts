import type { MerchantCategoryRepository } from "@expense/core";
import type { PrismaClient } from "@prisma/client";
import { merchantUpsertData, toCachedMerchant } from "./mappers.js";

export function makeMerchantCategoryRepository(
  prisma: PrismaClient,
): MerchantCategoryRepository {
  return {
    async lookup(normalizedMerchant) {
      const row = await prisma.merchantCategory.findUnique({
        where: { normalizedMerchant },
      });
      return row ? toCachedMerchant(row) : null;
    },

    async upsert(entry) {
      await prisma.merchantCategory.upsert({
        where: { normalizedMerchant: entry.normalizedMerchant },
        create: merchantUpsertData(entry),
        update: merchantUpsertData(entry),
      });
    },
  };
}
