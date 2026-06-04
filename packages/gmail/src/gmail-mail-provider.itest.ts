import { describe, it, expect } from "vitest";
import { mailProviderContract } from "@expense/core/testing/contracts";
import { gmailIntegrationEnabled, sandboxGmailConfig, sandboxRefreshToken } from "./testing/sandbox.js";
import { makeGmailMailProvider } from "./gmail-mail-provider.js";
import { encodeGmailPushData } from "./push-verify.js";

const enabled = gmailIntegrationEnabled();

describe.skipIf(!enabled)("GmailMailProvider (Google sandbox)", () => {
  const cfg = sandboxGmailConfig();
  const mail = makeGmailMailProvider(cfg);
  const refreshToken = sandboxRefreshToken();

  mailProviderContract(() => mail, "Gmail", {
    sampleGmailMessageId: process.env.GMAIL_TEST_MESSAGE_ID,
    refreshToken,
    skipExchange: true,
  });

  it("verifyPushNotification decodes a real-shaped payload", async () => {
    const data = encodeGmailPushData({
      emailAddress: process.env.GMAIL_TEST_ADDRESS ?? "user@gmail.com",
      historyId: "1",
    });
    const body = Buffer.from(JSON.stringify({ message: { data } }), "utf8");
    const verified = await mail.verifyPushNotification({}, body);
    expect(verified.gmailAddress).toContain("@");
  });
});
