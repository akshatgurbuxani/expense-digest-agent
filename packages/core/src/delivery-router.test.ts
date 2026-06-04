import { describe, it, expect } from "vitest";
import { makeDeliveryRouter } from "./delivery-router.js";
import { makeCapturingChannel } from "./testing/capturing-channel.js";
import { InvariantError } from "./errors.js";

describe("makeDeliveryRouter", () => {
  it("routes to the registered channel by kind", async () => {
    const email = makeCapturingChannel("email");
    const sms = makeCapturingChannel("sms");
    const router = makeDeliveryRouter([email, sms]);

    await router.routeFor("email").send({
      to: "a@example.com",
      subject: "Digest",
      body: "Hello",
    });
    expect(email.sent).toHaveLength(1);
    expect(sms.sent).toHaveLength(0);
  });

  it("throws when the preference is not registered", () => {
    const router = makeDeliveryRouter([makeCapturingChannel("email")]);
    expect(() => router.routeFor("sms")).toThrow(InvariantError);
  });
});
