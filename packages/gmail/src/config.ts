export interface GmailConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly oauthRedirectUri: string;
  readonly pubsubTopic: string;
  readonly pubsubPushAudience: string;
  /** Signs OAuth state (typically AUTH_JWT_SECRET). */
  readonly oauthStateSecret: string;
}

/** True when real Google OAuth credentials are configured. */
export function hasGmailCredentials(env: {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}): boolean {
  return env.GOOGLE_CLIENT_ID.length > 0 && env.GOOGLE_CLIENT_SECRET.length > 0;
}

export const GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";
