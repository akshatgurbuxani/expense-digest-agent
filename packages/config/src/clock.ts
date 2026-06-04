import type { Clock } from "@expense/core";

/** The production Clock: real wall time, in UTC. */
export function makeSystemClock(): Clock {
  return { now: () => new Date() };
}
