import { describe, it, expect } from "vitest";
import { deliveryChannelContract } from "@expense/core/testing/contracts";
import { makeNullLogger } from "@expense/core/testing";
import { makeDryRunChannel } from "./dry-run-channel.js";

describe("makeDryRunChannel", () => {
  deliveryChannelContract(
    () => makeDryRunChannel(makeNullLogger(), "sms"),
    "dry-run sms",
  );

  it("does not throw on send", async () => {
    const channel = makeDryRunChannel(makeNullLogger(), "email");
    await expect(
      channel.send({
        to: "user@example.com",
        subject: "Test",
        body: "Body",
      }),
    ).resolves.toMatchObject({
      providerMessageId: expect.stringMatching(/^dry-run-email-/),
    });
  });
});
