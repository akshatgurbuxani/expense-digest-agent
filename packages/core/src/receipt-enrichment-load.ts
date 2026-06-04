import type { UserId } from "./ids.js";
import type {
  MailMessageRepository,
  ReceiptRepository,
  TransactionReceiptLinkRepository,
} from "./ports/repositories.js";
import type { Transaction } from "./domain/transaction.js";
import type { ReceiptEnrichmentInput } from "./receipt-enrichment-facts.js";

export async function loadReceiptEnrichmentInput(deps: {
  readonly receipts: ReceiptRepository;
  readonly mailMessages: MailMessageRepository;
  readonly transactionReceiptLinks: TransactionReceiptLinkRepository;
  readonly userId: UserId;
  readonly window: { readonly start: Date; readonly end: Date };
  readonly transactionsInWindow: readonly Transaction[];
}): Promise<ReceiptEnrichmentInput> {
  const unmatchedReceipts = await deps.receipts.listUnmatchedInWindow(
    deps.userId,
    deps.window.start,
    deps.window.end,
  );

  const mailMessageById = new Map(
    await Promise.all(
      [...new Set(unmatchedReceipts.map((r) => r.mailMessageId))].map(
        async (mailMessageId) => {
          const message = await deps.mailMessages.findById(
            deps.userId,
            mailMessageId,
          );
          return message ? ([mailMessageId, message] as const) : null;
        },
      ),
    ).then((entries) => entries.filter((entry) => entry !== null)),
  );

  const receiptById = new Map(
    unmatchedReceipts.map((receipt) => [receipt.id, receipt] as const),
  );
  const linksInWindow = [];

  for (const txn of deps.transactionsInWindow) {
    const link = await deps.transactionReceiptLinks.findByTransactionId(
      deps.userId,
      txn.id,
    );
    if (!link) continue;

    linksInWindow.push(link);
    const receipt = await deps.receipts.findById(deps.userId, link.receiptId);
    if (!receipt) continue;

    receiptById.set(receipt.id, receipt);
    const message = await deps.mailMessages.findById(
      deps.userId,
      receipt.mailMessageId,
    );
    if (message) {
      mailMessageById.set(receipt.mailMessageId, message);
    }
  }

  return {
    unmatchedReceipts,
    mailMessageById,
    transactionsInWindow: deps.transactionsInWindow,
    linksInWindow,
    receiptById,
  };
}
