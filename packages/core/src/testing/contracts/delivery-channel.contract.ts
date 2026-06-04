import { describe, it, expect } from "vitest";
import type { DeliveryChannel, OutboundMessage } from "../../ports/delivery.js";
import { InvariantError, UpstreamError } from "../../errors.js";

/** Shared contract every DeliveryChannel implementation must satisfy. */
export function deliveryChannelContract(
  makeChannel: () => DeliveryChannel | Promise<DeliveryChannel>,
  label: string,
  sampleMessage?: OutboundMessage,
) {
  describe(`DeliveryChannel contract (${label})`, () => {
    it("send returns a provider id and sentAt", async () => {
      const channel = await Promise.resolve(makeChannel());
      const message = sampleMessage ?? {
        to: "test@example.com",
        subject: "Contract test",
        body: "Hello from contract suite",
      };
      const result = await channel.send(message);
      expect(result.providerMessageId.length).toBeGreaterThan(0);
      expect(result.sentAt).toBeInstanceOf(Date);
    });
  });
}

/** Error-mapping contract for adapter channels (mocked upstream failures). */
export function deliveryChannelErrorContract(
  makeChannel: (send: DeliveryChannel["send"]) => DeliveryChannel,
  label: string,
  errors?: {
    invalidRecipient?: unknown;
    transient?: unknown;
  },
) {
  const invalid =
    errors?.invalidRecipient ?? { status: 422, name: "validation_error" };
  const transient = errors?.transient ?? { status: 503 };

  describe(`DeliveryChannel error mapping (${label})`, () => {
    it("maps invalid recipient to InvariantError", async () => {
      const channel = makeChannel(async () => {
        throw invalid;
      });
      await expect(
        channel.send({
          to: "not-an-email",
          subject: "Test",
          body: "Hi",
        }),
      ).rejects.toBeInstanceOf(InvariantError);
    });

    it("maps transient upstream failure to UpstreamError", async () => {
      const channel = makeChannel(async () => {
        throw transient;
      });
      await expect(
        channel.send({
          to: "test@example.com",
          subject: "Test",
          body: "Hi",
        }),
      ).rejects.toBeInstanceOf(UpstreamError);
    });
  });
}
