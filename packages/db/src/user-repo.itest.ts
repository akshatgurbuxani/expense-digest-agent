import { beforeEach, describe, it, expect } from "vitest";
import { makePrisma } from "./client.js";
import { makeUserRepository } from "./user-repo.js";
import {
  TEST_DATABASE_URL,
  clearDatabase,
  insertUser,
} from "./testing/fixtures.js";
import type { User } from "@expense/core";
import { newId } from "@expense/core";

const prisma = makePrisma(TEST_DATABASE_URL);
const users = makeUserRepository(prisma);

beforeEach(async () => {
  await clearDatabase(prisma);
});

describe("UserRepository.findDueForDigest (Prisma)", () => {
  it("returns users whose local digest day and time match at", async () => {
    const due: User = {
      id: newId<"UserId">(),
      email: "due@example.com",
      timezone: "UTC",
      digestDay: 0,
      digestTime: "08:00",
      deliveryPreference: "email",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const notDue: User = {
      id: newId<"UserId">(),
      email: "later@example.com",
      timezone: "UTC",
      digestDay: 1,
      digestTime: "08:00",
      deliveryPreference: "email",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    await insertUser(prisma, due);
    await insertUser(prisma, notDue);

    // 2026-05-24 is a Sunday in UTC
    const at = new Date("2026-05-24T08:00:00.000Z");
    const result = await users.findDueForDigest(at);

    expect(result.map((u) => u.id)).toEqual([due.id]);
  });
});
