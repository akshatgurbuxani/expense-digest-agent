import { isExcludedReceiptKind } from "../domain/receipt-kind.js";
import {
  classifyMail,
  makeMailClassifiers,
  parseFromDomain,
  type MailClassifierConfig,
} from "../mail-classifiers.js";
import type { MailAccountId, UserId } from "../ids.js";
import type { MailProvider } from "../ports/mail-provider.js";
import type { JobProducer } from "../ports/jobs.js";
import type {
  MailMessageRepository,
} from "../ports/repositories.js";
import type { Logger } from "../ports/logger.js";

export interface MailIngestDeps {
  readonly mail: MailProvider;
  readonly mailMessages: MailMessageRepository;
  readonly queue: JobProducer;
  readonly classifierConfig: MailClassifierConfig;
  readonly log?: Logger;
}

/** Metadata → classify → persist MailMessage → maybe enqueue receipt.parse. */
export async function ingestGmailMessage(
  deps: MailIngestDeps,
  ctx: {
    readonly userId: UserId;
    readonly mailAccountId: MailAccountId;
    readonly gmailMessageId: string;
    readonly refreshToken: string;
  },
): Promise<void> {
  const log = deps.log?.child({ userId: ctx.userId, gmailMessageId: ctx.gmailMessageId });
  log?.info("ingesting Gmail message metadata");

  const existing = await deps.mailMessages.findByGmailMessageId(
    ctx.userId,
    ctx.mailAccountId,
    ctx.gmailMessageId,
  );
  if (existing) {
    log?.debug("message already processed, skipping metadata fetch", { existingId: existing.id });
    return;
  }

  const meta = await deps.mail.getMessageMetadata({
    refreshToken: ctx.refreshToken,
    gmailMessageId: ctx.gmailMessageId,
  });

  const fromDomain = parseFromDomain(meta.fromAddress);
  const classification = classifyMail(
    {
      fromAddress: meta.fromAddress,
      fromDomain,
      subject: meta.subject,
      snippet: meta.snippet,
    },
    makeMailClassifiers(deps.classifierConfig),
  );

  log?.info("message classification resolved", {
    fromAddress: meta.fromAddress,
    subject: meta.subject,
    outcome: classification.outcome,
    ...(classification.outcome === "classify"
      ? { kind: classification.kind }
      : { reason: classification.reason }),
  });

  const message = await deps.mailMessages.upsertSeen({
    userId: ctx.userId,
    mailAccountId: ctx.mailAccountId,
    gmailMessageId: ctx.gmailMessageId,
    threadId: meta.threadId,
    receivedAt: meta.receivedAt,
    fromAddress: meta.fromAddress,
    fromDomain,
    subject: meta.subject,
  });

  if (classification.outcome === "ignore") {
    log?.debug("message classified as ignore", { reason: classification.reason });
    await deps.mailMessages.updateClassification(ctx.userId, message.id, {
      processingStatus: "ignored",
      receiptKind: null,
      ignoreReason: classification.reason,
    });
    return;
  }

  if (isExcludedReceiptKind(classification.kind)) {
    log?.debug("message classified as excluded receipt kind", { kind: classification.kind });
    await deps.mailMessages.updateClassification(ctx.userId, message.id, {
      processingStatus: "ignored",
      receiptKind: classification.kind,
      ignoreReason: `excluded_kind:${classification.kind}`,
    });
    return;
  }

  await deps.mailMessages.updateClassification(ctx.userId, message.id, {
    processingStatus: "classified",
    receiptKind: classification.kind,
    ignoreReason: null,
  });

  log?.info("enqueuing receipt.parse for message", { messageId: message.id, receiptKind: classification.kind });
  await deps.queue.enqueue(
    "receipt.parse",
    { userId: ctx.userId, mailMessageId: message.id },
    { jobId: `receipt.parse:${ctx.gmailMessageId}` },
  );
}
