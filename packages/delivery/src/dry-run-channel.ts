import type { Clock, DeliveryChannel, DeliveryResult, OutboundMessage } from "@expense/core";
import type { Logger } from "@expense/core";
import type { DeliveryPreference } from "@expense/core";

/** Logs outbound messages instead of sending — local dev safety. */
export function makeDryRunChannel(
  log: Logger,
  kind: DeliveryPreference,
  clock?: Clock,
): DeliveryChannel {
  const now = clock ?? { now: () => new Date() };
  return {
    kind,
    async send(message: OutboundMessage): Promise<DeliveryResult> {
      log.info("dry-run delivery", {
        kind,
        to: message.to,
        subject: message.subject,
        bodyLength: message.body.length,
      });
      return {
        providerMessageId: `dry-run-${kind}-${Date.now()}`,
        sentAt: now.now(),
      };
    },
  };
}
