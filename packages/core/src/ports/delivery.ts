import type { DeliveryPreference } from "../domain/user.js";

export interface OutboundMessage {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

export interface DeliveryResult {
  readonly providerMessageId: string;
  readonly sentAt: Date;
}

export interface DeliveryChannel {
  readonly kind: DeliveryPreference;
  send(message: OutboundMessage): Promise<DeliveryResult>;
}

export interface DeliveryRouter {
  routeFor(pref: DeliveryPreference): DeliveryChannel;
}
