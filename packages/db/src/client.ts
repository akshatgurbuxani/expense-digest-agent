import { PrismaClient } from "@prisma/client";

/** One Prisma pool per process — created in the composition root. */
export function makePrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
}

export async function disconnectPrisma(client: PrismaClient): Promise<void> {
  await client.$disconnect();
}

export type { PrismaClient };
