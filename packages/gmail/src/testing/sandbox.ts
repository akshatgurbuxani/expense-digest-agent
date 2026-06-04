import type { GmailConfig } from "../config.js";

export function gmailIntegrationEnabled(): boolean {
  return (
    process.env.GMAIL_INTEGRATION === "true" &&
    Boolean(process.env.GOOGLE_CLIENT_ID) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET) &&
    Boolean(process.env.GMAIL_TEST_REFRESH_TOKEN)
  );
}

export function sandboxGmailConfig(): GmailConfig {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    oauthRedirectUri:
      process.env.GOOGLE_OAUTH_REDIRECT_URI ??
      "http://localhost:3000/api/gmail/callback",
    pubsubTopic:
      process.env.GMAIL_PUBSUB_TOPIC ?? "projects/test/topics/gmail-push",
    pubsubPushAudience: process.env.GMAIL_PUBSUB_PUSH_AUDIENCE ?? "",
    oauthStateSecret:
      process.env.AUTH_JWT_SECRET ?? "test-secret-min-16-chars",
  };
}

export function sandboxRefreshToken(): string {
  return process.env.GMAIL_TEST_REFRESH_TOKEN!;
}
