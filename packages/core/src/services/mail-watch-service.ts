import { NotFoundError } from "../errors.js";
import type { Clock } from "../ports/clock.js";
import type { MailProvider } from "../ports/mail-provider.js";
import type { MailAccountRepository } from "../ports/repositories.js";
import type { MailAccountId, UserId } from "../ids.js";
import type { Logger } from "../ports/logger.js";

export interface MailWatchDeps {
  readonly mail: MailProvider;
  readonly mailAccounts: MailAccountRepository;
  readonly clock: Clock;
  readonly pubsubTopic: string;
  readonly inboxLabelIds: readonly string[];
  readonly labelFilterBehavior: "INCLUDE" | "EXCLUDE";
  readonly log?: Logger;
}

export function makeMailWatchService(deps: MailWatchDeps) {
  return {
    /** Renew Gmail users.watch before the 7-day expiry window. */
    async run(payload: {
      userId: UserId;
      mailAccountId: MailAccountId;
    }): Promise<void> {
      const log = deps.log?.child({ userId: payload.userId, mailAccountId: payload.mailAccountId });
      log?.info("starting mailbox watch renewal", { pubsubTopic: deps.pubsubTopic });

      const account = await deps.mailAccounts.findById(payload.mailAccountId);
      if (!account || account.userId !== payload.userId) {
        log?.error("mail account not found or access denied");
        throw new NotFoundError(`mail account ${payload.mailAccountId}`);
      }
      if (account.status !== "active") {
        log?.warn("mailbox account is not active, skipping watch renewal", { status: account.status });
        return;
      }

      await deps.mailAccounts.withRefreshToken(account.id, async (refreshToken) => {
        const watch = await deps.mail.watchMailbox({
          refreshToken,
          topicName: deps.pubsubTopic,
          labelIds: deps.inboxLabelIds,
          labelFilterBehavior: deps.labelFilterBehavior,
        });

        await deps.mailAccounts.saveWatchExpiration(
          account.id,
          watch.expiration,
          watch.historyId,
        );

        log?.info("mailbox watch renewal successful", { expiration: watch.expiration, historyId: watch.historyId });
      });
    },
  };
}
