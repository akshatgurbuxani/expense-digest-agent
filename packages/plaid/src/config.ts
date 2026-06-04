export type PlaidEnvironment = "sandbox" | "development" | "production";

export interface PlaidConfig {
  readonly clientId: string;
  readonly secret: string;
  readonly env: PlaidEnvironment;
}

/** True when real Plaid API credentials are configured. */
export function hasPlaidCredentials(env: {
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
}): boolean {
  return env.PLAID_CLIENT_ID.length > 0 && env.PLAID_SECRET.length > 0;
}
