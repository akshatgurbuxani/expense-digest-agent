import { NotFoundError, ValidationError } from "../errors.js";
import { newId } from "../ids.js";
import type { UserId } from "../ids.js";
import { buildMonthlyReportFacts } from "../monthly-report-facts.js";
import { assertNoInventedMonthlyReportNumbers } from "../monthly-report-contract.js";
import type { Clock } from "../ports/clock.js";
import type { JobProducer } from "../ports/jobs.js";
import type { LlmProvider } from "../ports/llm-provider.js";
import type {
  MailMessageRepository,
  ReceiptRepository,
  ReportRepository,
  TransactionReceiptLinkRepository,
  TransactionRepository,
  UserRepository,
} from "../ports/repositories.js";
import { loadReceiptEnrichmentInput } from "../receipt-enrichment-load.js";
import type { DigestFactsConfig } from "../digest-facts.js";
import type { ReceiptEnrichmentConfig } from "../receipt-enrichment-facts.js";
import { monthWindowFromYearMonth } from "../window.js";
import type { Logger } from "../ports/logger.js";

export interface ReportDeps {
  users: UserRepository;
  transactions: TransactionRepository;
  receipts: ReceiptRepository;
  mailMessages: MailMessageRepository;
  transactionReceiptLinks: TransactionReceiptLinkRepository;
  reports: ReportRepository;
  llm: LlmProvider;
  queue: JobProducer;
  clock: Clock;
  digestFactsConfig: DigestFactsConfig;
  receiptEnrichmentConfig: ReceiptEnrichmentConfig;
  log?: Logger;
}

export function makeReportService(deps: ReportDeps) {
  return {
    async run(payload: { userId: UserId; yearMonth: string }): Promise<void> {
      const log = deps.log?.child({ userId: payload.userId, yearMonth: payload.yearMonth });
      log?.info("monthly report generation started");

      const user = await deps.users.findById(payload.userId);
      if (!user) {
        log?.error("user not found");
        throw new NotFoundError(`user ${payload.userId}`);
      }

      const existing = await deps.reports.findByYearMonth(
        payload.userId,
        payload.yearMonth,
      );
      if (existing) {
        log?.info("monthly report already generated for this month, skipping", { reportId: existing.id });
        return;
      }

      const window = monthWindowFromYearMonth(user.timezone, payload.yearMonth);
      log?.debug("computed month window", {
        timezone: user.timezone,
        start: window.start.toISOString(),
        end: window.end.toISOString(),
        monthLabel: window.monthLabel,
      });

      const txns = await deps.transactions.listInWindow(
        payload.userId,
        window.start,
        window.end,
      );
      log?.debug(`loaded ${txns.length} transactions in month window`);

      const receiptEnrichmentInput = await loadReceiptEnrichmentInput({
        receipts: deps.receipts,
        mailMessages: deps.mailMessages,
        transactionReceiptLinks: deps.transactionReceiptLinks,
        userId: payload.userId,
        window,
        transactionsInWindow: txns,
      });

      log?.debug("receipt enrichment loaded for monthly report", {
        unmatchedReceipts: receiptEnrichmentInput.unmatchedReceipts.length,
        linksInWindow: receiptEnrichmentInput.linksInWindow.length,
      });

      const facts = buildMonthlyReportFacts(
        {
          firstName: user.email.split("@")[0] ?? null,
          currency: "USD",
          window: {
            monthLabel: window.monthLabel,
            yearMonth: window.yearMonth,
            start: window.start,
            end: window.end,
          },
          transactions: txns,
          receiptEnrichment: receiptEnrichmentInput,
        },
        deps.digestFactsConfig,
        deps.receiptEnrichmentConfig,
      );

      log?.info("calling LLM for monthly report prose");
      const { subject, body } = await deps.llm.writeMonthlyReport(facts);
      
      try {
        assertNoInventedMonthlyReportNumbers(body, facts);
        log?.debug("money contract validated for monthly report");
      } catch (err) {
        log?.error("money contract validation failed for monthly report", { error: String(err) });
        throw new ValidationError(
          `monthly report failed money contract for ${payload.yearMonth}`,
          err,
        );
      }

      const reportId = newId<"ReportId">();
      await deps.reports.create({
        id: reportId,
        userId: payload.userId,
        yearMonth: payload.yearMonth,
        monthStart: window.start,
        monthEnd: window.end,
        facts,
        subject,
        content: body,
        deliveredAt: null,
      });

      log?.debug("monthly report persisted", { reportId, subject });

      await deps.queue.enqueue("delivery.send", {
        userId: payload.userId,
        kind: "monthly_report",
        refId: reportId,
      });

      log?.info("monthly report generation completed successfully", {
        reportId,
        totalSpend: facts.totalSpend,
        enqueued: "delivery.send",
      });
    },
  };
}
