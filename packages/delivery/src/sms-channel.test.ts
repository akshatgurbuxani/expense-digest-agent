import { describe, it, expect } from "vitest";
import { InvariantError, UpstreamError } from "@expense/core";
import { deliveryChannelErrorContract } from "@expense/core/testing/contracts";
import { makeSmsChannel } from "./sms-channel.js";

describe("makeSmsChannel (mocked)", () => {
  const fixedSentAt = new Date("2026-05-25T12:00:00.000Z");

  it("delegates to the injected sender", async () => {
    const channel = makeSmsChannel(
      {
        accountSid: "AC_test",
        authToken: "token",
        fromNumber: "+15551234567",
      },
      {
        clock: { now: () => fixedSentAt },
        sender: {
          send: async (input) => {
            expect(input.to).toBe("+15559876543");
            expect(input.body).toBe("Alert body");
            return { sid: "SM123" };
          },
        },
      },
    );

    const result = await channel.send({
      to: "+15559876543",
      subject: "ignored",
      body: "Alert body",
    });

    expect(result).toEqual({
      providerMessageId: "SM123",
      sentAt: fixedSentAt,
    });
  });

  deliveryChannelErrorContract(
    (send) =>
      makeSmsChannel(
        {
          accountSid: "AC_test",
          authToken: "token",
          fromNumber: "+15551234567",
        },
        {
          sender: {
            send: async () => {
              await send({ to: "", subject: "", body: "" });
              return { sid: "unused" };
            },
          },
        },
      ),
    "Twilio",
    { invalidRecipient: { code: 21211 }, transient: { status: 503 } },
  );

  it("maps sender throws through mapTwilioError", async () => {
    const channel = makeSmsChannel(
      {
        accountSid: "AC_test",
        authToken: "token",
        fromNumber: "+15551234567",
      },
      {
        sender: {
          send: async () => {
            throw { code: 21211 };
          },
        },
      },
    );

    await expect(
      channel.send({ to: "bad", subject: "x", body: "y" }),
    ).rejects.toBeInstanceOf(InvariantError);

    const upstream = makeSmsChannel(
      {
        accountSid: "AC_test",
        authToken: "token",
        fromNumber: "+15551234567",
      },
      {
        sender: {
          send: async () => {
            throw { status: 503 };
          },
        },
      },
    );

    await expect(
      upstream.send({ to: "+15559876543", subject: "x", body: "y" }),
    ).rejects.toBeInstanceOf(UpstreamError);
  });
});
