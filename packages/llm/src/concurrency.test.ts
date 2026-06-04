import { describe, it, expect } from "vitest";
import { makeConcurrencyLimiter } from "./concurrency.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("makeConcurrencyLimiter", () => {
  it("never exceeds the configured concurrency", async () => {
    const limiter = makeConcurrencyLimiter(2);
    let active = 0;
    let maxActive = 0;

    await Promise.all(
      Array.from({ length: 8 }, () =>
        limiter.run(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await sleep(30);
          active -= 1;
        }),
      ),
    );

    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
