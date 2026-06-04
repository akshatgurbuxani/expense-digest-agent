import type { UserId } from "../ids.js";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type DeliveryPreference = "email" | "sms";

export interface User {
  readonly id: UserId;
  readonly email: string;
  readonly timezone: string;
  readonly digestDay: Weekday;
  readonly digestTime: string;
  readonly deliveryPreference: DeliveryPreference;
  readonly createdAt: Date;
}
