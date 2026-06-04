import { newId, type AccountId, type ItemId, type UserId } from "@expense/core";
import type {
  AccountRepository,
  BankProvider,
  ItemRepository,
} from "@expense/core";
import type { TestRepositories } from "@expense/core/testing";
import { makePlaidApi } from "../plaid-bank-provider.js";
import { createSandboxPublicToken, sandboxPlaidConfig } from "./sandbox.js";

export interface PlaidLiveDemoCharge {
  readonly amountDollars: number;
  readonly description: string;
  readonly date?: string;
}

export interface PlaidLiveDemoSetup {
  readonly itemId: ItemId;
  readonly accountId: AccountId;
  readonly plaidAccountId: string;
}

/**
 * Create a fresh Plaid sandbox item, seed the account row, and inject a custom charge.
 * Caller runs `sync` + `drain` to pull the transaction into repos.
 */
export async function setupPlaidSandboxForLiveDemo(deps: {
  readonly bank: BankProvider;
  readonly items: ItemRepository;
  readonly accounts: AccountRepository;
  readonly seedAccount: (account: {
    readonly id: AccountId;
    readonly itemId: ItemId;
    readonly userId: UserId;
    readonly plaidAccountId: string;
    readonly name: string;
    readonly type: string;
  }) => void;
  readonly userId: UserId;
  readonly charge: PlaidLiveDemoCharge;
}): Promise<PlaidLiveDemoSetup> {
  const client = makePlaidApi(sandboxPlaidConfig());
  const publicToken = await createSandboxPublicToken(client);
  const exchanged = await deps.bank.exchangePublicToken(publicToken);

  const item = await deps.items.create(
    { userId: deps.userId, plaidItemId: exchanged.plaidItemId },
    exchanged.accessToken,
  );

  const accountsResponse = await client.accountsGet({
    access_token: exchanged.accessToken,
  });
  const plaidAccount = accountsResponse.data.accounts[0];
  if (!plaidAccount) {
    throw new Error("Plaid sandbox item returned no accounts");
  }

  const accountId = newId<"AccountId">();
  deps.seedAccount({
    id: accountId,
    itemId: item.id,
    userId: deps.userId,
    plaidAccountId: plaidAccount.account_id,
    name: plaidAccount.name,
    type: plaidAccount.type ?? "depository",
  });

  const date = deps.charge.date ?? new Date().toISOString().slice(0, 10);
  await client.sandboxTransactionsCreate({
    access_token: exchanged.accessToken,
    transactions: [
      {
        amount: deps.charge.amountDollars,
        date_posted: date,
        date_transacted: date,
        description: deps.charge.description,
      },
    ],
  });

  return {
    itemId: item.id,
    accountId,
    plaidAccountId: plaidAccount.account_id,
  };
}

/** Convenience wrapper when repos expose `_seed.account`. */
export function seedAccountOnTestRepos(
  repos: TestRepositories,
  account: {
    readonly id: AccountId;
    readonly itemId: ItemId;
    readonly userId: UserId;
    readonly plaidAccountId: string;
    readonly name: string;
    readonly type: string;
  },
): void {
  repos._seed.account({
    id: account.id,
    itemId: account.itemId,
    userId: account.userId,
    plaidAccountId: account.plaidAccountId,
    name: account.name,
    type: account.type,
    lastSyncedAt: null,
  });
}
