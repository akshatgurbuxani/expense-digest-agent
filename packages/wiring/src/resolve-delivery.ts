import { makeDeliveryRouter } from "@expense/core";
import { makeCapturingChannel } from "@expense/core/testing";
import type { Env } from "@expense/config";
import type { Logger } from "@expense/core";
import {
  hasResendCredentials,
  hasTwilioCredentials,
  makeDryRunChannel,
  makeEmailChannel,
  makeSmsChannel,
} from "@expense/delivery";
import { InvariantError } from "@expense/core";
import type { WorkerWiringOptions } from "./types.js";

export function resolveDelivery(
  env: Env,
  log: Logger,
  opts: WorkerWiringOptions,
): {
  router: ReturnType<typeof makeDeliveryRouter>;
  emailChannel?: ReturnType<typeof makeCapturingChannel>;
} {
  const useCapture = opts.captureDelivery ?? env.NODE_ENV === "test";

  if (useCapture) {
    const emailChannel = makeCapturingChannel("email");
    const smsChannel = makeCapturingChannel("sms");
    return {
      router: makeDeliveryRouter([emailChannel, smsChannel]),
      emailChannel,
    };
  }

  if (env.DELIVERY_DRY_RUN) {
    return {
      router: makeDeliveryRouter([
        makeDryRunChannel(log, "email"),
        makeDryRunChannel(log, "sms"),
      ]),
    };
  }

  if (!hasResendCredentials(env)) {
    throw new InvariantError(
      "RESEND_API_KEY is required when DELIVERY_DRY_RUN=false",
    );
  }

  const channels = [
    makeEmailChannel({
      apiKey: env.RESEND_API_KEY,
      from: env.DIGEST_FROM_EMAIL,
    }),
  ];

  if (hasTwilioCredentials(env)) {
    channels.push(
      makeSmsChannel({
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        fromNumber: env.TWILIO_FROM_NUMBER,
      }),
    );
  }

  return { router: makeDeliveryRouter(channels) };
}
