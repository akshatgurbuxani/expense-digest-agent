import type { UserId } from "../ids.js";

export interface VerifiedMailPush {
  readonly gmailAddress: string;
  /** Notification checkpoint — not startHistoryId for history.list. */
  readonly historyId: string;
}

export interface RawMailMetadata {
  readonly gmailMessageId: string;
  readonly threadId: string;
  readonly receivedAt: Date;
  readonly fromAddress: string;
  readonly subject: string;
  readonly snippet: string | null;
  readonly labelIds: readonly string[];
}

export interface RawMailBody {
  readonly gmailMessageId: string;
  readonly textPlain: string | null;
  readonly textHtml: string | null;
}

export interface MailChangePage {
  readonly candidateMessageIds: readonly string[];
  readonly deletedMessageIds: readonly string[];
  readonly nextHistoryId: string;
}

export interface MailListPage {
  readonly messageIds: readonly string[];
  readonly nextPageToken: string | null;
}

export interface MailProvider {
  createAuthUrl(input: {
    userId: UserId;
    redirectUri: string;
    forceConsent?: boolean;
    returnTo?: string;
  }): Promise<{ url: string }>;

  exchangeAuthCode(input: { code: string; redirectUri: string }): Promise<{
    gmailAddress: string;
    refreshToken: string;
  }>;

  watchMailbox(input: {
    refreshToken: string;
    topicName: string;
    labelIds?: readonly string[];
    labelFilterBehavior?: "INCLUDE" | "EXCLUDE";
  }): Promise<{ historyId: string; expiration: Date }>;

  stopMailbox(input: { refreshToken: string }): Promise<void>;

  revokeAccess(input: { refreshToken: string }): Promise<void>;

  verifyPushNotification(
    headers: Record<string, string>,
    rawBody: Buffer,
  ): Promise<VerifiedMailPush>;

  listChanges(input: {
    refreshToken: string;
    startHistoryId: string;
    labelId?: string;
  }): Promise<MailChangePage>;

  listRecentMessageIds(input: {
    refreshToken: string;
    query: string;
    maxResults?: number;
    pageToken?: string;
  }): Promise<MailListPage>;

  getMessageMetadata(input: {
    refreshToken: string;
    gmailMessageId: string;
  }): Promise<RawMailMetadata>;

  getMessageBody(input: {
    refreshToken: string;
    gmailMessageId: string;
  }): Promise<RawMailBody>;
}
