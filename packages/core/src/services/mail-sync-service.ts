import { MailHistoryExpiredError, NotFoundError } from "../errors.js";
import type { Clock } from "../ports/clock.js";
import type { JobProducer } from "../ports/jobs.js";
import type { MailProvider } from "../ports/mail-provider.js";
import type {
  MailAccountRepository,
  MailMessageRepository,
} from "../ports/repositories.js";
import type { MailAccountId, UserId } from "../ids.js";
import type { MailClassifierConfig } from "../mail-classifiers.js";
import { ingestGmailMessage } from "./mail-ingest.js";
import type { Logger } from "../ports/logger.js";

export interface MailSyncDeps {
  readonly mail: MailProvider;
  readonly mailAccounts: MailAccountRepository;
  readonly mailMessages: MailMessageRepository;
  readonly queue: JobProducer;
  readonly clock: Clock;
  readonly classifierConfig: MailClassifierConfig;
  readonly log?: Logger;
}

export function makeMailSyncService(deps: MailSyncDeps) {
  return {
    async run(payload: {
      userId: UserId;
      mailAccountId: MailAccountId;
    }): Promise<void> {
      const log = deps.log?.child({ userId: payload.userId, mailAccountId: payload.mailAccountId });
      log?.info("mail sync started");

      const account = await deps.mailAccounts.findById(payload.mailAccountId);
      if (!account || account.userId !== payload.userId) {
        log?.error("mail account not found or access denied");
        throw new NotFoundError(`mail account ${payload.mailAccountId}`);
      }

      await deps.mailAccounts.withRefreshToken(account.id, async (refreshToken) => {
        const startHistoryId = account.historyId ?? "0";
        log?.debug("fetching gmail changes since historyId", { startHistoryId });

        try {
          const page = await deps.mail.listChanges({
            refreshToken,
            startHistoryId,
          });

          log?.info("fetched gmail changes", {
            deletedCount: page.deletedMessageIds.length,
            candidateCount: page.candidateMessageIds.length,
            nextHistoryId: page.nextHistoryId,
          });

          for (const gmailMessageId of page.deletedMessageIds) {
            log?.info("processing deleted message", { gmailMessageId });
            await deps.mailMessages.markDeleted(
              payload.userId,
              account.id,
              gmailMessageId,
            );
          }

          for (const gmailMessageId of page.candidateMessageIds) {
            log?.info("processing candidate message", { gmailMessageId });
            await ingestGmailMessage(deps, {
              userId: payload.userId,
              mailAccountId: account.id,
              gmailMessageId,
              refreshToken,
            });
          }

          await deps.mailAccounts.saveHistoryId(
            account.id,
            page.nextHistoryId,
            deps.clock.now(),
          );
          
          log?.info("mail sync completed successfully", { nextHistoryId: page.nextHistoryId });
        } catch (err) {
          if (err instanceof MailHistoryExpiredError) {
            log?.warn("gmail history expired, enqueuing mail.fullSync", { startHistoryId });
            await deps.queue.enqueue(
              "mail.fullSync",
              {
                userId: payload.userId,
                mailAccountId: account.id,
              },
              { jobId: `mail.fullSync:${account.id}` },
            );
            return;
          }
          log?.error("error during mail sync", { error: String(err) });
          throw err;
        }
      });
    },
  };
}
