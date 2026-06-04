import { beforeEach, describe, it, expect } from "vitest";
import { makeCrypto } from "@expense/config";
import { aUser } from "@expense/core/testing";
import { makePrisma } from "./client.js";
import { makeItemRepository } from "./item-repo.js";
import {
  TEST_DATABASE_URL,
  TEST_ENCRYPTION_KEY,
  clearDatabase,
  insertUser,
} from "./testing/fixtures.js";

const prisma = makePrisma(TEST_DATABASE_URL);
const crypto = makeCrypto(TEST_ENCRYPTION_KEY);
const items = makeItemRepository(prisma, crypto);

beforeEach(async () => {
  await clearDatabase(prisma);
});

describe("ItemRepository.withAccessToken (Prisma)", () => {
  it("decrypts the access token only inside the callback scope", async () => {
    const user = aUser();
    await insertUser(prisma, user);

    const item = await items.create(
      { userId: user.id, plaidItemId: "plaid-item-crypto" },
      "secret-access-token",
    );

    const row = await prisma.plaidItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(row.accessTokenEncrypted).not.toBe("secret-access-token");

    let seen: string | undefined;
    await items.withAccessToken(item.id, async (token) => {
      seen = token;
      return null;
    });
    expect(seen).toBe("secret-access-token");
  });
});
