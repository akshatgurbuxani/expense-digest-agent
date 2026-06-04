import { NotFoundError } from "../errors.js";
import type { Clock } from "../ports/clock.js";
import type { MailProvider } from "../ports/mail-provider.js";
import type {
  MailAccountRepository,
  MailMessageRepository,
} from "../ports/repositories.js";
import type { MailAccountId, UserId } from "../ids.js";
import type { MailClassifierConfig } from "../mail-classifiers.js";
import type { JobProducer } from "../ports/jobs.js";
import { fullSyncQueryWithBackfill } from "../mail-full-sync-query.js";
import { ingestGmailMessage } from "./mail-ingest.js";
import type { Logger } from "../ports/logger.js";

export interface MailFullSyncDeps {
  readonly mail: MailProvider;
  readonly mailAccounts: MailAccountRepository;
  readonly mailMessages: MailMessageRepository;
  readonly queue: JobProducer;
  readonly clock: Clock;
  readonly classifierConfig: MailClassifierConfig;
  readonly fullSyncQuery: string;
  readonly fullSyncBackfillDays: number;
  readonly log?: Logger;
}

export function makeMailFullSyncService(deps: MailFullSyncDeps) {
  return {
    async run(payload: {
      userId: UserId;
      mailAccountId: MailAccountId;
    }): Promise<void> {
      const log = deps.log?.child({ userId: payload.userId, mailAccountId: payload.mailAccountId });
      log?.info("mail fullSync started");

      const account = await deps.mailAccounts.findById(payload.mailAccountId);
      if (!account || account.userId !== payload.userId) {
        log?.error("mail account not found or access denied");
        throw new NotFoundError(`mail account ${payload.mailAccountId}`);
      }

      await deps.mailAccounts.withRefreshToken(account.id, async (refreshToken) => {
        const query = fullSyncQueryWithBackfill(
          deps.fullSyncQuery,
          deps.fullSyncBackfillDays,
          deps.clock.now(),
        );
        log?.debug("mail fullSync query computed", { query });

        let pageToken: string | undefined;
        let pageCount = 0;
        let totalCount = 0;

        do {
          pageCount++;
          log?.debug(`fetching gmail fullSync page ${pageCount}`, { pageToken });

          const page = await deps.mail.listRecentMessageIds({
            refreshToken,
            query,
            pageToken,
          });

          log?.info(`fetched fullSync page ${pageCount} with messages`, { count: page.messageIds.length });
          totalCount += page.messageIds.length;

          for (const gmailMessageId of page.messageIds) {
            log?.info("processing candidate message (fullSync)", { gmailMessageId });
            await ingestGmailMessage(deps, {
              userId: payload.userId,
              mailAccountId: account.id,
              gmailMessageId,
              refreshToken,
            });
          }

          pageToken = page.nextPageToken ?? undefined;
        } while (pageToken);

        log?.info(`finished fetching all messages in fullSync. total ingested messages: ${totalCount}`);

        const checkpoint = await deps.mail.listChanges({
          refreshToken,
          startHistoryId: "1",
        });

        await deps.mailAccounts.saveHistoryId(
          account.id,
          checkpoint.nextHistoryId,
          deps.clock.now(),
        );

        log?.info("mail fullSync completed successfully", { nextHistoryId: checkpoint.nextHistoryId });
      });
    },
  };
}
