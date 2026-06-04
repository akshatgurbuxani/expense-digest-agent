import type { UserId } from "@expense/core";
import type { AccountRepository } from "@expense/core";
import type { PrismaClient } from "@prisma/client";
import { toAccount } from "./mappers.js";

export function makeAccountRepository(prisma: PrismaClient): AccountRepository {
  return {
    async findByPlaidAccountId(userId: UserId, plaidAccountId) {
      const row = await prisma.account.findUnique({
        where: {
          userId_plaidAccountId: { userId, plaidAccountId },
        },
      });
      return row ? toAccount(row) : null;
    },
  };
}
