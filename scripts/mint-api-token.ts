import { makeAuthTokenService, makeSystemClock } from "@expense/config";

function parseArgs(): { userId: string; ttlSeconds?: number } {
  const args = process.argv.slice(2);
  let userId = "";
  let ttlSeconds: number | undefined;

  for (const arg of args) {
    if (arg.startsWith("--user-id=")) {
      userId = arg.split("=")[1];
    }
    if (arg.startsWith("--ttl=")) {
      ttlSeconds = Number(arg.split("=")[1]);
    }
  }

  if (!userId) {
    console.error("Usage: tsx scripts/mint-api-token.ts --user-id=<userId> [--ttl=<seconds>]");
    console.error("");
    console.error("  --user-id   The user ID to mint a token for (required)");
    console.error("  --ttl       Token lifetime in seconds (default: 86400 / 24h)");
    process.exit(1);
  }

  return { userId, ttlSeconds };
}

async function main(): Promise<void> {
  const { userId, ttlSeconds } = parseArgs();
  const secret = process.env.AUTH_JWT_SECRET;

  if (!secret || secret.length < 16) {
    console.error("AUTH_JWT_SECRET must be set and at least 16 characters");
    console.error("Load your .env file first or set it inline:");
    console.error("  dotenv -e .env -- tsx scripts/mint-api-token.ts --user-id=xxx");
    process.exit(1);
  }

  const tokens = makeAuthTokenService({
    secret,
    clock: makeSystemClock(),
  });

  const token = await tokens.mint(userId, ttlSeconds ? { ttlSeconds } : undefined);
  process.stdout.write(token);
}

await main();
