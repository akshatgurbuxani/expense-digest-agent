import type { BankProvider, VerifiedWebhook } from "@expense/core";
import type { UserId } from "@expense/core";
import { CountryCode, Products } from "plaid";
import type { JWKPublicKey } from "plaid";
import type { PlaidConfig } from "./config.js";
import { makePlaidClient } from "./client.js";
import { mapPlaidError } from "./errors.js";
import { mapSyncResponse } from "./mappers.js";
import { verifyPlaidWebhook } from "./webhook-verify.js";

export function makeBankProvider(cfg: PlaidConfig): BankProvider {
  const client = makePlaidClient(cfg);
  const keyCache = new Map<string, JWKPublicKey>();

  async function fetchVerificationKey(keyId: string): Promise<JWKPublicKey> {
    const cached = keyCache.get(keyId);
    if (cached) return cached;

    try {
      const response = await client.webhookVerificationKeyGet({ key_id: keyId });
      const key = response.data.key;
      keyCache.set(keyId, key);
      return key;
    } catch (err) {
      throw mapPlaidError(err);
    }
  }

  return {
    async createLinkToken(userId: UserId) {
      try {
        const response = await client.linkTokenCreate({
          user: { client_user_id: userId },
          client_name: "Expense Digest Agent",
          products: [Products.Transactions],
          country_codes: [CountryCode.Us],
          language: "en",
        });
        return {
          linkToken: response.data.link_token,
          expiration: new Date(response.data.expiration),
        };
      } catch (err) {
        throw mapPlaidError(err);
      }
    },

    async exchangePublicToken(publicToken: string) {
      try {
        const response = await client.itemPublicTokenExchange({
          public_token: publicToken,
        });
        return {
          plaidItemId: response.data.item_id,
          accessToken: response.data.access_token,
        };
      } catch (err) {
        throw mapPlaidError(err);
      }
    },

    async syncTransactions(input) {
      try {
        const response = await client.transactionsSync({
          access_token: input.accessToken,
          cursor: input.cursor ?? undefined,
        });
        return mapSyncResponse(response.data);
      } catch (err) {
        throw mapPlaidError(err);
      }
    },

    async verifyWebhook(
      headers: Record<string, string>,
      rawBody: Buffer,
    ): Promise<VerifiedWebhook> {
      return verifyPlaidWebhook(headers, rawBody, {
        fetchKey: fetchVerificationKey,
      });
    },
  };
}

/** Exposed for tests that need direct SDK access (sandbox token creation). */
export function makePlaidApi(cfg: PlaidConfig) {
  return makePlaidClient(cfg);
}
