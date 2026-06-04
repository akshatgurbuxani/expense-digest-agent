import type { DigestFacts } from "./digest-facts.js";
import type { DigestId, UserId } from "../ids.js";

export interface Digest {
  readonly id: DigestId;
  readonly userId: UserId;
  readonly weekStart: Date;
  readonly weekEnd: Date;
  readonly facts: DigestFacts;
  readonly subject: string;
  readonly content: string;
  readonly deliveredAt: Date | null;
}
