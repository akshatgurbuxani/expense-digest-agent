import { ValidationError } from "@expense/core";
import type {
  MailChangePage,
  MailListPage,
  MailProvider,
  RawMailBody,
  RawMailMetadata,
} from "@expense/core";
import type { UserId } from "@expense/core";
import { OAuth2Client } from "google-auth-library";
import type { GmailConfig } from "./config.js";
import { GMAIL_READONLY_SCOPE } from "./config.js";
import { mapGmailHttpError } from "./errors.js";
import { extractBodiesFromPayload } from "./mime-walk.js";
import { mapGmailMetadata } from "./mappers.js";
import { signOAuthState, verifyOAuthState } from "./oauth-state.js";
import { verifyGmailPushNotification } from "./push-verify.js";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

interface HistoryRecord {
  readonly messagesAdded?: readonly { readonly message?: { readonly id?: string } }[];
  readonly messagesDeleted?: readonly { readonly message?: { readonly id?: string } }[];
  readonly labelsAdded?: readonly { readonly message?: { readonly id?: string } }[];
}

export function makeGmailMailProvider(cfg: GmailConfig): MailProvider {
  const oauth = new OAuth2Client(
    cfg.clientId,
    cfg.clientSecret,
    cfg.oauthRedirectUri,
  );

  async function accessToken(refreshToken: string): Promise<string> {
    oauth.setCredentials({ refresh_token: refreshToken });
    const { token } = await oauth.getAccessToken();
    if (!token) {
      throw new ValidationError("Google OAuth returned no access token");
    }
    return token;
  }

  async function gmailFetch(
    refreshToken: string,
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    const token = await accessToken(refreshToken);
    const url = path.startsWith("http") ? path : `${GMAIL_API}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw mapGmailHttpError(response.status, body);
    }
    return response;
  }

  return {
    async createAuthUrl(input) {
      const state = await signOAuthState(
        {
          userId: input.userId,
          returnTo: input.returnTo,
        },
        cfg.oauthStateSecret,
      );
      const url = oauth.generateAuthUrl({
        access_type: "offline",
        scope: [GMAIL_READONLY_SCOPE],
        redirect_uri: input.redirectUri,
        state,
        ...(input.forceConsent ? { prompt: "consent" } : {}),
      });
      return { url };
    },

    async exchangeAuthCode(input) {
      const { tokens } = await oauth.getToken({
        code: input.code,
        redirect_uri: input.redirectUri,
      });
      if (!tokens.refresh_token) {
        throw new ValidationError(
          "Google OAuth did not return a refresh token — reconnect with consent",
        );
      }

      oauth.setCredentials(tokens);
      const profile = await oauth.request<{ emailAddress: string }>({
        url: `${GMAIL_API}/profile`,
      });
      const gmailAddress = profile.data.emailAddress;
      if (!gmailAddress) {
        throw new ValidationError("Gmail profile missing emailAddress");
      }

      return {
        gmailAddress,
        refreshToken: tokens.refresh_token,
      };
    },

    async watchMailbox(input) {
      const response = await gmailFetch(input.refreshToken, "/watch", {
        method: "POST",
        body: JSON.stringify({
          topicName: input.topicName,
          labelIds: input.labelIds ?? ["INBOX"],
          labelFilterBehavior: input.labelFilterBehavior ?? "INCLUDE",
        }),
      });
      const data = (await response.json()) as {
        historyId?: string;
        expiration?: string;
      };
      if (!data.historyId || !data.expiration) {
        throw new ValidationError("Gmail watch response missing fields");
      }
      return {
        historyId: data.historyId,
        expiration: new Date(Number(data.expiration)),
      };
    },

    async stopMailbox(input) {
      await gmailFetch(input.refreshToken, "/stop", { method: "POST", body: "{}" });
    },

    async revokeAccess(input) {
      const params = new URLSearchParams({ token: input.refreshToken });
      const response = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      if (!response.ok) {
        const body = await response.text();
        throw mapGmailHttpError(response.status, body);
      }
    },

    async verifyPushNotification(headers, rawBody) {
      return verifyGmailPushNotification(
        headers,
        rawBody,
        cfg.pubsubPushAudience,
      );
    },

    async listChanges(input) {
      const candidates = new Set<string>();
      const deleted = new Set<string>();
      let nextPageToken: string | undefined;
      let nextHistoryId = input.startHistoryId;

      do {
        const params = new URLSearchParams({
          startHistoryId: input.startHistoryId,
        });
        if (input.labelId) params.set("labelId", input.labelId);
        if (nextPageToken) params.set("pageToken", nextPageToken);

        const response = await gmailFetch(
          input.refreshToken,
          `/history?${params.toString()}`,
        );
        const data = (await response.json()) as {
          history?: readonly HistoryRecord[];
          nextPageToken?: string;
          historyId?: string;
        };

        for (const record of data.history ?? []) {
          collectIds(record.messagesAdded, candidates);
          collectIds(record.labelsAdded, candidates);
          collectIds(record.messagesDeleted, deleted);
        }

        if (data.historyId) nextHistoryId = data.historyId;
        nextPageToken = data.nextPageToken;
      } while (nextPageToken);

      return {
        candidateMessageIds: [...candidates],
        deletedMessageIds: [...deleted],
        nextHistoryId,
      } satisfies MailChangePage;
    },

    async listRecentMessageIds(input) {
      const params = new URLSearchParams({
        q: input.query,
        maxResults: String(input.maxResults ?? 100),
      });
      if (input.pageToken) params.set("pageToken", input.pageToken);

      const response = await gmailFetch(
        input.refreshToken,
        `/messages?${params.toString()}`,
      );
      const data = (await response.json()) as {
        messages?: readonly { readonly id?: string }[];
        nextPageToken?: string;
      };

      return {
        messageIds: (data.messages ?? [])
          .map((m) => m.id)
          .filter((id): id is string => Boolean(id)),
        nextPageToken: data.nextPageToken ?? null,
      } satisfies MailListPage;
    },

    async getMessageMetadata(input) {
      const params = new URLSearchParams({
        format: "metadata",
        metadataHeaders: "From",
      });
      params.append("metadataHeaders", "Subject");

      const response = await gmailFetch(
        input.refreshToken,
        `/messages/${input.gmailMessageId}?${params.toString()}`,
      );
      const message = (await response.json()) as Parameters<
        typeof mapGmailMetadata
      >[0];
      return mapGmailMetadata(message);
    },

    async getMessageBody(input) {
      const response = await gmailFetch(
        input.refreshToken,
        `/messages/${input.gmailMessageId}?format=full`,
      );
      const message = (await response.json()) as {
        readonly id?: string;
        readonly payload?: Parameters<typeof extractBodiesFromPayload>[0];
      };
      const bodies = extractBodiesFromPayload(message.payload);
      return {
        gmailMessageId: message.id ?? input.gmailMessageId,
        textPlain: bodies.textPlain,
        textHtml: bodies.textHtml,
      } satisfies RawMailBody;
    },
  };
}

/** Re-export for OAuth callback route. */
export { verifyOAuthState };

function collectIds(
  entries:
    | readonly { readonly message?: { readonly id?: string } }[]
    | undefined,
  target: Set<string>,
): void {
  for (const entry of entries ?? []) {
    const id = entry.message?.id;
    if (id) target.add(id);
  }
}

/** Build GmailConfig from typed env. */
export function gmailConfigFromEnv(env: {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_OAUTH_REDIRECT_URI: string;
  GMAIL_PUBSUB_TOPIC: string;
  GMAIL_PUBSUB_PUSH_AUDIENCE: string;
  AUTH_JWT_SECRET: string;
}): GmailConfig {
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    oauthRedirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
    pubsubTopic: env.GMAIL_PUBSUB_TOPIC,
    pubsubPushAudience: env.GMAIL_PUBSUB_PUSH_AUDIENCE,
    oauthStateSecret: env.AUTH_JWT_SECRET,
  };
}

/** Type guard for routes parsing OAuth state. */
export type OAuthUserId = UserId;
