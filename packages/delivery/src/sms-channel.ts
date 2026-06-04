import type {
  Clock,
  DeliveryChannel,
  DeliveryResult,
  OutboundMessage,
} from "@expense/core";
import twilio from "twilio";
import { mapTwilioError } from "./errors.js";

export interface SmsChannelConfig {
  readonly accountSid: string;
  readonly authToken: string;
  readonly fromNumber: string;
}

export interface SmsSender {
  send(input: {
    to: string;
    from: string;
    body: string;
  }): Promise<{ sid: string }>;
}

export interface SmsChannelDeps {
  readonly sender?: SmsSender;
  readonly clock?: Clock;
}

export function hasTwilioCredentials(env: {
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_FROM_NUMBER: string;
}): boolean {
  return (
    env.TWILIO_ACCOUNT_SID.length > 0 &&
    env.TWILIO_AUTH_TOKEN.length > 0 &&
    env.TWILIO_FROM_NUMBER.length > 0
  );
}

export function makeSmsChannel(
  cfg: SmsChannelConfig,
  deps: SmsChannelDeps = {},
): DeliveryChannel {
  const sender =
    deps.sender ??
    makeTwilioSender(
      twilio(cfg.accountSid, cfg.authToken),
      cfg.fromNumber,
    );
  const now = deps.clock ?? { now: () => new Date() };

  return {
    kind: "sms",
    async send(message: OutboundMessage): Promise<DeliveryResult> {
      try {
        const result = await sender.send({
          to: message.to,
          from: cfg.fromNumber,
          body: message.body,
        });
        return {
          providerMessageId: result.sid,
          sentAt: now.now(),
        };
      } catch (err) {
        throw mapTwilioError(err);
      }
    },
  };
}

function makeTwilioSender(
  client: ReturnType<typeof twilio>,
  fromNumber: string,
): SmsSender {
  return {
    async send(input) {
      const msg = await client.messages.create({
        to: input.to,
        from: fromNumber,
        body: input.body,
      });
      return { sid: msg.sid };
    },
  };
}
