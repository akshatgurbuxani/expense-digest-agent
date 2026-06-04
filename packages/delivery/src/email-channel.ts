import type {
  Clock,
  DeliveryChannel,
  DeliveryResult,
  OutboundMessage,
} from "@expense/core";
import { Resend } from "resend";
import { mapResendError } from "./errors.js";

export interface EmailChannelConfig {
  readonly apiKey: string;
  readonly from: string;
}

export interface EmailSender {
  send(input: {
    from: string;
    to: string[];
    subject: string;
    html: string;
  }): Promise<{ id: string }>;
}

export interface EmailChannelDeps {
  readonly sender?: EmailSender;
  readonly clock?: Clock;
}

export function hasResendCredentials(env: {
  RESEND_API_KEY: string;
}): boolean {
  return env.RESEND_API_KEY.length > 0;
}

export function makeEmailChannel(
  cfg: EmailChannelConfig,
  deps: EmailChannelDeps = {},
): DeliveryChannel {
  const sender =
    deps.sender ??
    makeResendSender(new Resend(cfg.apiKey));
  const now = deps.clock ?? { now: () => new Date() };

  return {
    kind: "email",
    async send(message: OutboundMessage): Promise<DeliveryResult> {
      try {
        const result = await sender.send({
          from: cfg.from,
          to: [message.to],
          subject: message.subject,
          html: message.body,
        });
        return {
          providerMessageId: result.id,
          sentAt: now.now(),
        };
      } catch (err) {
        throw mapResendError(err);
      }
    },
  };
}

function makeResendSender(client: Resend): EmailSender {
  return {
    async send(input) {
      const { data, error } = await client.emails.send(input);
      if (error) throw error;
      if (!data?.id) throw new InvariantError("resend returned no message id");
      return { id: data.id };
    },
  };
}
