import type { BankProvider } from "@expense/core";
import { makeFakeBank } from "@expense/core/testing";
import type { Env } from "@expense/config";
import { hasPlaidCredentials, makeBankProvider } from "@expense/plaid";
import type { ApiWiringOptions } from "./types.js";

export function resolveBank(env: Env, opts: ApiWiringOptions): BankProvider {
  if (opts.bank) return opts.bank;
  if (hasPlaidCredentials(env)) {
    return makeBankProvider({
      clientId: env.PLAID_CLIENT_ID,
      secret: env.PLAID_SECRET,
      env: env.PLAID_ENV,
    });
  }
  return makeFakeBank();
}
