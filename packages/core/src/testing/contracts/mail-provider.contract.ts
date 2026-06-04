import { describe, it, expect } from "vitest";
import { MailHistoryExpiredError } from "../../errors.js";
import type { MailProvider } from "../../ports/mail-provider.js";
import { newId } from "../../ids.js";

/** Shared contract every MailProvider adapter must satisfy. */
export function mailProviderContract(
  makeMail: () => MailProvider | Promise<MailProvider>,
  label: string,
  options?: {
    readonly sampleGmailMessageId?: string;
    readonly refreshToken?: string;
    readonly skipExchange?: boolean;
  },
) {
  describe(`MailProvider contract (${label})`, () => {
    const refreshToken = options?.refreshToken ?? "refresh-token";

    it("createAuthUrl returns a URL with offline access and redirect uri", async () => {
      const mail = await Promise.resolve(makeMail());
      const userId = newId<"UserId">();
      const { url } = await mail.createAuthUrl({
        userId,
        redirectUri: "http://localhost:3000/api/gmail/callback",
        forceConsent: true,
      });

      expect(url).toContain("redirect_uri=");
      expect(url).toContain("access_type=offline");
      expect(url).toContain("prompt=consent");
    });

    it("exchangeAuthCode returns gmail address and refresh token", async () => {
      if (options?.skipExchange) return;
      const mail = await Promise.resolve(makeMail());
      const result = await mail.exchangeAuthCode({
        code: "test-code",
        redirectUri: "http://localhost:3000/api/gmail/callback",
      });

      expect(result.gmailAddress).toContain("@");
      expect(result.refreshToken.length).toBeGreaterThan(0);
    });

    it("watchMailbox returns historyId and future expiration", async () => {
      const mail = await Promise.resolve(makeMail());
      const result = await mail.watchMailbox({
        refreshToken,
        topicName: "projects/test/topics/gmail-push",
        labelIds: ["INBOX"],
        labelFilterBehavior: "INCLUDE",
      });

      expect(result.historyId.length).toBeGreaterThan(0);
      expect(result.expiration.getTime()).toBeGreaterThan(Date.now() - 60_000);
    });

    it("verifyPushNotification returns gmail address and historyId", async () => {
      const mail = await Promise.resolve(makeMail());
      const data = Buffer.from(
        JSON.stringify({
          message: {
            data: Buffer.from(
              JSON.stringify({
                emailAddress: "contract@test.example.com",
                historyId: "42",
              }),
            )
              .toString("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, ""),
          },
        }),
      );
      const verified = await mail.verifyPushNotification({}, data);

      expect(verified.gmailAddress).toContain("@");
      expect(verified.historyId.length).toBeGreaterThan(0);
    });

    it("listChanges returns normalized change page fields", async () => {
      const mail = await Promise.resolve(makeMail());
      const page = await mail.listChanges({
        refreshToken,
        startHistoryId: "100",
      });

      expect(Array.isArray(page.candidateMessageIds)).toBe(true);
      expect(Array.isArray(page.deletedMessageIds)).toBe(true);
      expect(typeof page.nextHistoryId).toBe("string");
    });

    if (options?.sampleGmailMessageId) {
      it("getMessageMetadata and getMessageBody return aligned ids", async () => {
        const mail = await Promise.resolve(makeMail());
        const id = options.sampleGmailMessageId!;
        const meta = await mail.getMessageMetadata({
          refreshToken,
          gmailMessageId: id,
        });
        const body = await mail.getMessageBody({
          refreshToken,
          gmailMessageId: id,
        });

        expect(meta.gmailMessageId).toBe(id);
        expect(body.gmailMessageId).toBe(id);
        expect(meta.receivedAt).toBeInstanceOf(Date);
      });
    }
  });
}

export function mailProviderHistoryExpiredContract(
  makeMail: () => MailProvider | Promise<MailProvider>,
  expiredHistoryId: string,
) {
  describe("MailProvider history expiry", () => {
    it("throws MailHistoryExpiredError for expired startHistoryId", async () => {
      const mail = await Promise.resolve(makeMail());
      await expect(
        mail.listChanges({
          refreshToken: "refresh-token",
          startHistoryId: expiredHistoryId,
        }),
      ).rejects.toBeInstanceOf(MailHistoryExpiredError);
    });
  });
}
