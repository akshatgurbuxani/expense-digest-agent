import { Registry } from "./registry.js";
import type { DeliveryChannel, DeliveryRouter } from "./ports/delivery.js";
import type { DeliveryPreference } from "./domain/user.js";

/** Pure router: registry keyed by channel kind. */
export function makeDeliveryRouter(
  channels: DeliveryChannel[],
): DeliveryRouter {
  const registry = new Registry<DeliveryPreference, DeliveryChannel>();
  for (const c of channels) registry.register(c.kind, c);
  return { routeFor: (pref) => registry.get(pref) };
}
