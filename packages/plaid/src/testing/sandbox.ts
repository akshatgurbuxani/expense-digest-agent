import { Products } from "plaid";
import type { PlaidApi } from "plaid";

/** First Platypus Bank — stable Plaid sandbox institution with transactions. */
export const SANDBOX_INSTITUTION_ID = "ins_109508";

/** Create a sandbox public token for integration tests. */
export async function createSandboxPublicToken(
  client: PlaidApi,
): Promise<string> {
  const response = await client.sandboxPublicTokenCreate({
    institution_id: SANDBOX_INSTITUTION_ID,
    initial_products: [Products.Transactions],
    options: {
      override_username: "user_good",
      override_password: "pass_good",
    },
  });
  return response.data.public_token;
}

export function plaidIntegrationEnabled(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function sandboxPlaidConfig() {
  return {
    clientId: process.env.PLAID_CLIENT_ID!,
    secret: process.env.PLAID_SECRET!,
    env: "sandbox" as const,
  };
}
