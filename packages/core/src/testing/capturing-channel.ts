import type {
  DeliveryChannel,
  DeliveryResult,
  OutboundMessage,
} from "../ports/delivery.js";
import type { DeliveryPreference } from "../domain/user.js";

/** Records outbound messages instead of sending. */
export function makeCapturingChannel(
  kind: DeliveryPreference = "email",
): DeliveryChannel & { readonly sent: OutboundMessage[] } {
  const sent: OutboundMessage[] = [];
  return {
    kind,
    async send(message: OutboundMessage): Promise<DeliveryResult> {
      sent.push(message);
      return { providerMessageId: `fake-${sent.length}`, sentAt: new Date() };
    },
    sent,
  };
}
