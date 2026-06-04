import {
  type Clock,
  InvariantError,
} from "@expense/core";
import {
  loadEnv,
  makeCrypto,
  makeStderrLogger,
  makeMcpTokenService,
  makeSystemClock,
  type Env,
  type McpTokenService,
} from "@expense/config";
import { makePrisma, makeRepositories, type PrismaClient } from "@expense/db";
import type { Logger } from "@expense/core";
import type { UserId } from "@expense/core";
import { resolveMcpUserId } from "./auth.js";
import { createMcpServer } from "./create-server.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface McpContainerOptions {
  env?: Env;
  clock?: Clock;
  accessToken?: string;
}

export interface McpContainer {
  env: Env;
  log: Logger;
  prisma: PrismaClient;
  userId: UserId;
  tokens: McpTokenService;
  server: McpServer;
}

/** Composition root for the MCP server process. */
export async function buildMcpContainer(
  opts: McpContainerOptions = {},
): Promise<McpContainer> {
  const env = opts.env ?? loadEnv();
  const log = makeStderrLogger({ level: env.LOG_LEVEL });
  const clock = opts.clock ?? makeSystemClock();

  if (!env.ENCRYPTION_KEY) {
    throw new InvariantError(
      "ENCRYPTION_KEY is required for the MCP server (Postgres repos)",
    );
  }

  const tokens = makeMcpTokenService({
    secret: env.AUTH_JWT_SECRET,
    clock,
  });
  const userId = await resolveMcpUserId(
    tokens,
    opts.accessToken ?? process.env.MCP_ACCESS_TOKEN,
  );

  const prisma = makePrisma(env.DATABASE_URL);
  const repos = makeRepositories(prisma, makeCrypto(env.ENCRYPTION_KEY));

  const server = createMcpServer({
    userId,
    repos,
    clock,
  });

  return { env, log, prisma, userId, tokens, server };
}
