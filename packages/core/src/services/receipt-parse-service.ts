import { NotFoundError } from "../errors.js";
import { newId } from "../ids.js";
import type { MailMessageId, UserId } from "../ids.js";
import { isExcludedReceiptKind } from "../domain/receipt-kind.js";
import type { Clock } from "../ports/clock.js";
import type { JobProducer } from "../ports/jobs.js";
import type { MailProvider } from "../ports/mail-provider.js";
import type { ReceiptExtractor } from "../ports/receipt-extractor.js";
import type {
  MailAccountRepository,
  MailMessageRepository,
  ReceiptRepository,
} from "../ports/repositories.js";
import type { Logger } from "../ports/logger.js";

export interface ReceiptParseDeps {
  readonly mail: MailProvider;
  readonly mailAccounts: MailAccountRepository;
  readonly mailMessages: MailMessageRepository;
  readonly receipts: ReceiptRepository;
  readonly extractor: ReceiptExtractor;
  readonly queue: JobProducer;
  readonly clock: Clock;
  readonly log?: Logger;
}

export function makeReceiptParseService(deps: ReceiptParseDeps) {
  return {
    async run(payload: {
      userId: UserId;
      mailMessageId: MailMessageId;
    }): Promise<void> {
      const log = deps.log?.child({ userId: payload.userId, mailMessageId: payload.mailMessageId });
      log?.info("receipt parse service started");

      const message = await deps.mailMessages.findById(
        payload.userId,
        payload.mailMessageId,
      );
      if (!message) {
        log?.error("mail message not found");
        throw new NotFoundError(`mail message ${payload.mailMessageId}`);
      }

      if (!message.receiptKind || isExcludedReceiptKind(message.receiptKind)) {
        log?.warn("receipt kind is excluded or null, skipping parsing", { receiptKind: message.receiptKind });
        return;
      }

      const existing = await deps.receipts.findByMailMessageId(
        payload.userId,
        message.id,
      );
      if (existing) {
        log?.debug("receipt already parsed and exists, skipping", { receiptId: existing.id });
        return;
      }

      const account = await deps.mailAccounts.findById(message.mailAccountId);
      if (!account || account.userId !== payload.userId) {
        log?.error("mail account not found or access denied", { mailAccountId: message.mailAccountId });
        throw new NotFoundError(`mail account ${message.mailAccountId}`);
      }

      await deps.mailAccounts.withRefreshToken(account.id, async (refreshToken) => {
        log?.debug("fetching full message body from gmail", { gmailMessageId: message.gmailMessageId });
        const body = await deps.mail.getMessageBody({
          refreshToken,
          gmailMessageId: message.gmailMessageId,
        });

        log?.info("sent to LLM receipt extractor", {
          kind: message.receiptKind!,
          fromAddress: message.fromAddress,
          subject: message.subject,
        });

        const extracted = await deps.extractor.extract({
          kind: message.receiptKind!,
          fromAddress: message.fromAddress,
          subject: message.subject,
          textPlain: body.textPlain,
          textHtml: body.textHtml,
          receivedAt: message.receivedAt,
        });

        log?.info("received LLM extracted data", {
          merchantName: extracted.merchantName,
          totalAmount: extracted.totalAmount?.toDecimalString(),
          confidence: extracted.confidence,
          lineItemCount: extracted.lineItems.length,
        });

        const receiptId = newId<"ReceiptId">();
        await deps.receipts.create({
          id: receiptId,
          userId: payload.userId,
          mailMessageId: message.id,
          kind: message.receiptKind!,
          merchantName: extracted.merchantName,
          merchantDomain: extracted.merchantDomain,
          orderId: extracted.orderId,
          orderUrl: extracted.orderUrl,
          totalAmount: extracted.totalAmount,
          occurredAt: extracted.occurredAt,
          lineItems: extracted.lineItems,
          extractedAt: deps.clock.now(),
          extractionSource: extracted.source,
          confidence: extracted.confidence,
        });

        log?.debug("receipt persisted to db", { receiptId });

        await deps.mailMessages.updateClassification(payload.userId, message.id, {
          processingStatus: "parsed",
          receiptKind: message.receiptKind,
          ignoreReason: null,
        });

        log?.info("enqueuing receipt.match for receipt", { receiptId });
        await deps.queue.enqueue("receipt.match", {
          userId: payload.userId,
          receiptId,
        });
      });
    },
  };
}
