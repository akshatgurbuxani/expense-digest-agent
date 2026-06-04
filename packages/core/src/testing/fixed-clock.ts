import type { Clock } from "../ports/clock.js";

/** A controllable Clock for tests. Advance or set time deterministically. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(start: Date = new Date("2026-01-01T00:00:00.000Z")) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current); // copy: callers can't mutate our internal time
  }

  set(date: Date): void {
    this.current = new Date(date);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
