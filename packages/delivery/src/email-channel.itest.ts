import { describe } from "vitest";
import { deliveryChannelContract } from "@expense/core/testing/contracts";
import { makeEmailChannel } from "./email-channel.js";
import {
  resendIntegrationEnabled,
  resendTestConfig,
} from "./testing/helpers.js";

describe.skipIf(!resendIntegrationEnabled())(
  "EmailChannel (live Resend)",
  () => {
    deliveryChannelContract(
      () => makeEmailChannel(resendTestConfig()),
      "Resend",
      {
        to: "delivered@resend.dev",
        subject: "Expense Digest contract test",
        body: "<p>Live Resend contract test</p>",
      },
    );
  },
);
