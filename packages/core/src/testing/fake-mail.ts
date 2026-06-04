import { MailHistoryExpiredError } from "../errors.js";
import type {
  MailChangePage,
  MailListPage,
  MailProvider,
  VerifiedMailPush,
} from "../ports/mail-provider.js";
import type { UserId } from "../ids.js";

export interface FakeMailMessage {
  readonly gmailMessageId: string;
  readonly threadId: string;
  readonly receivedAt: Date;
  readonly fromAddress: string;
  readonly subject: string;
  readonly snippet: string | null;
  readonly labelIds: readonly string[];
  readonly textPlain: string | null;
  readonly textHtml: string | null;
}

export interface FakeMailOptions {
  readonly gmailAddress?: string;
  readonly refreshToken?: string;
  readonly push?: VerifiedMailPush;
  readonly changePages?: MailChangePage[];
  readonly expiredHistoryId?: string;
  readonly listPages?: MailListPage[];
  readonly messages?: Record<string, FakeMailMessage>;
  /** Per-refreshToken change pages. Takes precedence over changePages. */
  readonly accountChangePages?: Record<string, MailChangePage[]>;
  /** Per-refreshToken list pages. Takes precedence over listPages. */
  readonly accountListPages?: Record<string, MailListPage[]>;
  /** Per-refreshToken expired history IDs. */
  readonly accountExpiredHistoryIds?: Record<string, string>;
}

/** Scriptable MailProvider for tests — CI only, not for end users. */
export function makeFakeMailProvider(opts: FakeMailOptions = {}): MailProvider {
  let changePageIndex = 0;
  let listPageIndex = 0;
  const changePageIndexes = new Map<string, number>();
  const listPageIndexes = new Map<string, number>();
  const messages = { ...opts.messages };

  return {
    async createAuthUrl(input) {
      const consent = input.forceConsent ? "&prompt=consent" : "";
      return {
        url: `https://accounts.google.test/o/oauth2?client=test&redirect_uri=${encodeURIComponent(input.redirectUri)}&scope=gmail.readonly&access_type=offline${consent}&state=${input.userId}`,
      };
    },

    async exchangeAuthCode(_input) {
      return {
        gmailAddress: opts.gmailAddress ?? "user@gmail.com",
        refreshToken: opts.refreshToken ?? "refresh-test-token",
      };
    },

    async watchMailbox(_input) {
      return {
        historyId: "1000",
        expiration: new Date(Date.now() + 7 * 86_400_000),
      };
    },

    async stopMailbox(_input) {
      /* no-op */
    },

    async revokeAccess(_input) {
      /* no-op */
    },

    async verifyPushNotification(_headers, _rawBody) {
      return (
        opts.push ?? {
          gmailAddress: opts.gmailAddress ?? "user@gmail.com",
          historyId: "1001",
        }
      );
    },

    async listChanges(input) {
      const token = input.refreshToken;
      const accountExpiredId = opts.accountExpiredHistoryIds?.[token];
      if (accountExpiredId === input.startHistoryId || opts.expiredHistoryId === input.startHistoryId) {
        throw new MailHistoryExpiredError(
          `history expired at ${input.startHistoryId}`,
        );
      }
      const accountPages = token ? opts.accountChangePages?.[token] : undefined;
      const pages = accountPages ?? opts.changePages ?? [];
      const idx = accountPages ? (changePageIndexes.get(token) ?? 0) : changePageIndex;
      const page = pages[idx];
      if (accountPages) {
        changePageIndexes.set(token, idx + 1);
      } else {
        changePageIndex = idx + 1;
      }
      if (!page) {
        return {
          candidateMessageIds: [],
          deletedMessageIds: [],
          nextHistoryId: input.startHistoryId,
        };
      }
      return page;
    },

    async listRecentMessageIds(input) {
      const token = input.refreshToken;
      const accountPages = token ? opts.accountListPages?.[token] : undefined;
      const pages = accountPages ?? opts.listPages ?? [];
      const idx = accountPages ? (listPageIndexes.get(token) ?? 0) : listPageIndex;
      const page = pages[idx];
      if (accountPages) {
        listPageIndexes.set(token, idx + 1);
      } else {
        listPageIndex = idx + 1;
      }
      return (
        page ?? {
          messageIds: Object.keys(messages),
          nextPageToken: null,
        }
      );
    },

    async getMessageMetadata(input) {
      const msg = messages[input.gmailMessageId];
      if (!msg) {
        throw new Error(`fake mail: unknown message ${input.gmailMessageId}`);
      }
      return {
        gmailMessageId: msg.gmailMessageId,
        threadId: msg.threadId,
        receivedAt: msg.receivedAt,
        fromAddress: msg.fromAddress,
        subject: msg.subject,
        snippet: msg.snippet,
        labelIds: msg.labelIds,
      };
    },

    async getMessageBody(input) {
      const msg = messages[input.gmailMessageId];
      if (!msg) {
        throw new Error(`fake mail: unknown message ${input.gmailMessageId}`);
      }
      return {
        gmailMessageId: msg.gmailMessageId,
        textPlain: msg.textPlain,
        textHtml: msg.textHtml,
      };
    },
  };
}

/** Type guard helper for tests wiring OAuth state. */
export function parseFakeAuthUserId(url: string): UserId | null {
  const match = url.match(/state=([^&]+)/);
  return match?.[1] ? (match[1] as UserId) : null;
}
