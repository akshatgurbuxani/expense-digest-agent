import { InvariantError, Money, type CurrencyCode } from "@expense/core";
import type { RawTransaction, SyncPage } from "@expense/core";
import type { RemovedTransaction, Transaction } from "plaid";

/** Map a Plaid transaction to the adapter edge type. */
export function mapPlaidTransaction(txn: Transaction): RawTransaction {
  const currency = resolveCurrency(txn);
  return {
    plaidTransactionId: txn.transaction_id,
    plaidAccountId: txn.account_id,
    amount: Money.fromDecimalString(String(txn.amount), currency),
    merchantNameRaw: txn.merchant_name ?? txn.name,
    plaidPfc: txn.personal_finance_category?.primary ?? null,
    occurredAt: new Date(`${txn.date}T00:00:00.000Z`),
  };
}

export function mapSyncResponse(data: {
  added: Transaction[];
  modified: Transaction[];
  removed: RemovedTransaction[];
  next_cursor: string;
  has_more: boolean;
}): SyncPage {
  return {
    added: data.added.map(mapPlaidTransaction),
    modified: data.modified.map(mapPlaidTransaction),
    removed: data.removed.map((r) => r.transaction_id),
    nextCursor: data.next_cursor,
    hasMore: data.has_more,
  };
}

function resolveCurrency(txn: Transaction): CurrencyCode {
  const code = txn.iso_currency_code ?? txn.unofficial_currency_code;
  if (code === "USD" || code === "EUR" || code === "GBP") {
    return code;
  }
  throw new InvariantError(`unsupported transaction currency: ${code ?? "null"}`);
}
