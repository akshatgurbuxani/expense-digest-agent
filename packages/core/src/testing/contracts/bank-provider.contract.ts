import type { BankProvider } from "../../ports/bank-provider.js";
import { newId } from "../../ids.js";
import { describe, it, expect } from "vitest";

/** Shared contract every BankProvider adapter must satisfy. */
export function bankProviderContract(
  makeBank: () => BankProvider | Promise<BankProvider>,
  label: string,
  options?: {
    /** When set, exchangePublicToken is exercised against a real sandbox token. */
    sandboxPublicToken?: () => Promise<string>;
  },
) {
  describe(`BankProvider contract (${label})`, () => {
    it("createLinkToken returns a token and future expiration", async () => {
      const bank = await Promise.resolve(makeBank());
      const userId = newId<"UserId">();
      const { linkToken, expiration } = await bank.createLinkToken(userId);

      expect(linkToken.length).toBeGreaterThan(0);
      expect(expiration.getTime()).toBeGreaterThan(Date.now() - 60_000);
    });

    if (options?.sandboxPublicToken) {
      it("exchangePublicToken returns item id and access token", async () => {
        const bank = await Promise.resolve(makeBank());
        const publicToken = await options.sandboxPublicToken!();
        const result = await bank.exchangePublicToken(publicToken);

        expect(result.plaidItemId.length).toBeGreaterThan(0);
        expect(result.accessToken.length).toBeGreaterThan(0);
      });

      it("syncTransactions returns a well-formed first page", async () => {
        const bank = await Promise.resolve(makeBank());
        const publicToken = await options.sandboxPublicToken!();
        const { accessToken } = await bank.exchangePublicToken(publicToken);

        const page = await bank.syncTransactions({
          accessToken,
          cursor: null,
        });

        expect(typeof page.nextCursor).toBe("string");
        expect(typeof page.hasMore).toBe("boolean");
        expect(Array.isArray(page.added)).toBe(true);
        expect(Array.isArray(page.modified)).toBe(true);
        expect(Array.isArray(page.removed)).toBe(true);
      });
    }
  });
}
