import { describe } from "vitest";
import { deliveryChannelContract } from "@expense/core/testing/contracts";
import { makeSmsChannel } from "./sms-channel.js";
import {
  twilioIntegrationEnabled,
  twilioTestConfig,
  twilioTestRecipient,
} from "./testing/helpers.js";

const recipient = twilioTestRecipient();

describe.skipIf(!twilioIntegrationEnabled() || !recipient)(
  "SmsChannel (live Twilio)",
  () => {
    deliveryChannelContract(
      () => makeSmsChannel(twilioTestConfig()),
      "Twilio",
      {
        to: recipient!,
        subject: "ignored",
        body: "Expense Digest contract test (SMS)",
      },
    );
  },
);
