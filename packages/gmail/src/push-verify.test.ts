import { describe, it, expect } from "vitest";
import { ValidationError } from "@expense/core";
import {
  decodeGmailPushData,
  encodeGmailPushData,
  verifyGmailPushNotification,
} from "./push-verify.js";

describe("Gmail push decode", () => {
  it("round-trips emailAddress and historyId", () => {
    const encoded = encodeGmailPushData({
      emailAddress: "user@gmail.com",
      historyId: "12345",
    });
    expect(decodeGmailPushData(encoded)).toEqual({
      emailAddress: "user@gmail.com",
      historyId: "12345",
    });
  });

  it("rejects empty data", () => {
    expect(() => decodeGmailPushData("")).toThrow(ValidationError);
  });

  it("verifyGmailPushNotification decodes payload when audience is unset", async () => {
    const data = encodeGmailPushData({
      emailAddress: "shopper@gmail.com",
      historyId: "999",
    });
    const body = Buffer.from(JSON.stringify({ message: { data } }), "utf8");

    const verified = await verifyGmailPushNotification({}, body, "");
    expect(verified).toEqual({
      gmailAddress: "shopper@gmail.com",
      historyId: "999",
    });
  });
});
