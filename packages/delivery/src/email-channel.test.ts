import { describe, it, expect } from "vitest";
import { InvariantError, UpstreamError } from "@expense/core";
import { deliveryChannelErrorContract } from "@expense/core/testing/contracts";
import { makeEmailChannel } from "./email-channel.js";

describe("makeEmailChannel (mocked)", () => {
  const fixedSentAt = new Date("2026-05-25T12:00:00.000Z");

  it("delegates to the injected sender", async () => {
    const channel = makeEmailChannel(
      { apiKey: "re_test", from: "Digest <onboarding@resend.dev>" },
      {
        clock: { now: () => fixedSentAt },
        sender: {
          send: async (input) => {
            expect(input.to).toEqual(["user@example.com"]);
            expect(input.subject).toBe("Weekly digest");
            return { id: "msg_123" };
          },
        },
      },
    );

    const result = await channel.send({
      to: "user@example.com",
      subject: "Weekly digest",
      body: "<p>Hello</p>",
    });

    expect(result).toEqual({
      providerMessageId: "msg_123",
      sentAt: fixedSentAt,
    });
  });

  deliveryChannelErrorContract(
    (send) =>
      makeEmailChannel(
        { apiKey: "re_test", from: "Digest <onboarding@resend.dev>" },
        {
          sender: {
            send: async () => {
              await send({ to: "", subject: "", body: "" });
              return { id: "unused" };
            },
          },
        },
      ),
    "Resend",
  );

  it("maps sender throws through mapResendError", async () => {
    const channel = makeEmailChannel(
      { apiKey: "re_test", from: "Digest <onboarding@resend.dev>" },
      {
        sender: {
          send: async () => {
            throw { status: 422 };
          },
        },
      },
    );

    await expect(
      channel.send({ to: "bad", subject: "x", body: "y" }),
    ).rejects.toBeInstanceOf(InvariantError);

    const upstream = makeEmailChannel(
      { apiKey: "re_test", from: "Digest <onboarding@resend.dev>" },
      {
        sender: {
          send: async () => {
            throw { status: 503 };
          },
        },
      },
    );

    await expect(
      upstream.send({ to: "a@b.com", subject: "x", body: "y" }),
    ).rejects.toBeInstanceOf(UpstreamError);
  });
});
