import { Money } from "../money.js";
import { newId } from "../ids.js";
import type { Transaction } from "../domain/transaction.js";
import type { User } from "../domain/user.js";

/** Minimal user factory for tests. */
export function aUser(overrides: Partial<User> = {}): User {
  return {
    id: newId<"UserId">(),
    email: "test@example.com",
    timezone: "America/Denver",
    digestDay: 0,
    digestTime: "08:00",
    deliveryPreference: "email",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** Minimal transaction factory for tests. */
export function aTransaction(
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id: newId<"TransactionId">(),
    accountId: newId<"AccountId">(),
    userId: newId<"UserId">(),
    plaidTransactionId: newId(),
    amount: Money.of(1000, "USD"),
    merchantNameRaw: "TEST MERCHANT",
    merchantName: "Test Merchant",
    category: "other",
    plaidPfc: null,
    isSubscription: false,
    isRecurring: false,
    occurredAt: new Date("2026-05-20T12:00:00.000Z"),
    enrichedAt: new Date("2026-05-20T12:01:00.000Z"),
    removedAt: null,
    ...overrides,
  };
}
