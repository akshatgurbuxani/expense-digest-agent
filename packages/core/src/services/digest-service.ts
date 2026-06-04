import { NotFoundError, ValidationError } from "../errors.js";
import { newId } from "../ids.js";
import type { UserId } from "../ids.js";
import { Money } from "../money.js";
import type { Clock } from "../ports/clock.js";
import type { JobProducer } from "../ports/jobs.js";
import type { LlmProvider } from "../ports/llm-provider.js";
import type { Logger } from "../ports/logger.js";
import type {
  AnomalyRepository,
  BaselineRepository,
  DigestRepository,
  MailMessageRepository,
  ReceiptRepository,
  TransactionReceiptLinkRepository,
  TransactionRepository,
  UserRepository,
} from "../ports/repositories.js";
import { buildDigestFacts, type DigestFactsConfig } from "../digest-facts.js";
import { assertNoInventedNumbers } from "../money-contract.js";
import { loadReceiptEnrichmentInput } from "../receipt-enrichment-load.js";
import type { ReceiptEnrichmentConfig } from "../receipt-enrichment-facts.js";
import { weekWindowFor } from "../window.js";

export interface DigestDeps {
  users: UserRepository;
  transactions: TransactionRepository;
  baselines: BaselineRepository;
  anomalies: AnomalyRepository;
  digests: DigestRepository;
  receipts: ReceiptRepository;
  mailMessages: MailMessageRepository;
  transactionReceiptLinks: TransactionReceiptLinkRepository;
  llm: LlmProvider;
  queue: JobProducer;
  clock: Clock;
  log?: Logger;  // Optional for backward compat
  digestFactsConfig: DigestFactsConfig;
  receiptEnrichmentConfig: ReceiptEnrichmentConfig;
}

export function makeDigestService(deps: DigestDeps) {
  return {
    async run(payload: { userId: UserId; isoWeek: string }): Promise<void> {
      const log = deps.log?.child({ userId: payload.userId, isoWeek: payload.isoWeek });
      log?.info("digest generation started");

      const user = await deps.users.findById(payload.userId);
      if (!user) {
        log?.error("user not found");
        throw new NotFoundError(`user ${payload.userId}`);
      }

      const window = weekWindowFor(user.timezone, deps.clock.now());
      log?.debug("computed time window", {
        timezone: user.timezone,
        start: window.start.toISOString(),
        end: window.end.toISOString(),
        startLabel: window.startLabel,
        endLabel: window.endLabel,
      });

      const txns = await deps.transactions.listInWindow(
        payload.userId,
        window.start,
        window.end,
      );
      
      const baselines = await deps.baselines.getAll(payload.userId, "weekly");
      const undelivered = await deps.anomalies.listUndeliveredInWindow(
        payload.userId,
        window.start,
        window.end,
      );

      log?.debug("data loaded", {
        transactions: txns.length,
        baselines: baselines.length,
        anomalies: undelivered.length,
      });

      const receiptEnrichmentInput = await loadReceiptEnrichmentInput({
        receipts: deps.receipts,
        mailMessages: deps.mailMessages,
        transactionReceiptLinks: deps.transactionReceiptLinks,
        userId: payload.userId,
        window,
        transactionsInWindow: txns,
      });

      log?.debug("receipt enrichment loaded", {
        unmatchedReceipts: receiptEnrichmentInput.unmatchedReceipts.length,
        linksInWindow: receiptEnrichmentInput.linksInWindow.length,
        receiptById: receiptEnrichmentInput.receiptById.size,
        mailMessageById: receiptEnrichmentInput.mailMessageById.size,
      });

      const facts = buildDigestFacts(
        {
          firstName: user.email.split("@")[0] ?? null,
          currency: "USD",
          window: { startLabel: window.startLabel, endLabel: window.endLabel },
          transactions: txns,
          baselines,
          anomalies: undelivered.map((a) => {
            const txn = txns.find((t) => t.id === a.transactionId);
            return {
              reason: a.reason,
              detail: a.detail,
              amount: txn?.amount ?? Money.of(0, "USD"),
            };
          }),
          receiptEnrichment: {
            input: receiptEnrichmentInput,
            config: deps.receiptEnrichmentConfig,
          },
        },
        deps.digestFactsConfig,
      );

      log?.debug("facts computed", {
        totalSpend: facts.totalSpend,
        categories: facts.categories.length,
        maturity: facts.maturity,
        matchedReceipts: facts.matchedReceipts.length,
        unmatchedReceipts: facts.unmatchedReceipts.length,
        chargesMissingReceipts: facts.chargesMissingReceipts.length,
      });

      log?.info("calling LLM for digest prose");
      const { subject, body } = await deps.llm.writeDigest(facts);
      
      try {
        assertNoInventedNumbers(body, facts);
        log?.debug("money contract validated");
      } catch (err) {
        log?.error("money contract validation failed", { error: String(err) });
        throw new ValidationError(
          `digest failed money contract for week ${payload.isoWeek}`,
          err,
        );
      }

      const digestId = newId<"DigestId">();
      await deps.digests.create({
        id: digestId,
        userId: payload.userId,
        weekStart: window.start,
        weekEnd: window.end,
        facts,
        subject,
        content: body,
        deliveredAt: null,
      });

      log?.debug("digest persisted", { digestId, subject });

      await deps.queue.enqueue("delivery.send", {
        userId: payload.userId,
        kind: "digest",
        refId: digestId,
      });

      log?.info("digest generation completed", {
        digestId,
        totalSpend: facts.totalSpend,
        enqueued: "delivery.send",
      });
    },
  };
}
