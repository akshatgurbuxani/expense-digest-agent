import { InvariantError, type Repositories } from "@expense/core";
import { makeInMemoryRepositories, type TestRepositories } from "@expense/core/testing";
import { makeCrypto, type Env } from "@expense/config";
import { makePrisma, makeRepositories, type PrismaClient } from "@expense/db";
import type { WiringOptions } from "./types.js";

export function resolveRepos(
  env: Env,
  opts: WiringOptions,
): { repos: Repositories | TestRepositories; prisma?: PrismaClient } {
  if (opts.repos) {
    return { repos: opts.repos };
  }
  if (opts.useDatabase) {
    if (!env.ENCRYPTION_KEY) {
      throw new InvariantError(
        "ENCRYPTION_KEY is required when useDatabase=true",
      );
    }
    const prisma = makePrisma(env.DATABASE_URL);
    const crypto = makeCrypto(env.ENCRYPTION_KEY);
    return { repos: makeRepositories(prisma, crypto), prisma };
  }
  return { repos: makeInMemoryRepositories() };
}
