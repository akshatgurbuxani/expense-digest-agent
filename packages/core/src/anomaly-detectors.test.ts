import { describe, it, expect } from "vitest";
import { Money } from "./money.js";
import { aTransaction } from "./testing/builders.js";
import {
  makeDuplicateChargeDetector,
  makeNewSubscriptionDetector,
  makePriceIncreaseDetector,
  makeUnusualSpendDetector,
  type DetectionContext,
} from "./anomaly-detectors.js";
import { TEST_ANOMALY_CONFIG } from "./testing/tunables.js";
import { newId } from "./ids.js";
import type { SpendBaseline } from "./domain/baseline.js";

const userId = newId<"UserId">();

function ctx(partial: Partial<DetectionContext>): DetectionContext {
  return {
    transaction: aTransaction(),
    recentSameMerchant: [],
    merchantHistoryMinorUnits: [],
    categoryBaseline: null,
    ...partial,
  };
}

const cfg = TEST_ANOMALY_CONFIG;
const priceIncreaseDetector = makePriceIncreaseDetector(cfg);
const duplicateChargeDetector = makeDuplicateChargeDetector(cfg);
const newSubscriptionDetector = makeNewSubscriptionDetector();
const unusualSpendDetector = makeUnusualSpendDetector(cfg);

describe("anomaly detectors", () => {
  describe("priceIncreaseDetector", () => {
    it("fires when charge is ≥1.5× the merchant median", () => {
      const verdict = priceIncreaseDetector.detect(
        ctx({
          transaction: aTransaction({
            merchantName: "Netflix",
            amount: Money.of(1599, "USD"),
          }),
          merchantHistoryMinorUnits: [999, 999, 999],
        }),
      );
      expect(verdict?.reason).toBe("price_increase");
      expect(verdict?.severity).toBe("high");
    });

    it("does not fire when charge is within normal range", () => {
      expect(
        priceIncreaseDetector.detect(
          ctx({
            transaction: aTransaction({ amount: Money.of(1000, "USD") }),
            merchantHistoryMinorUnits: [999, 1000, 1001],
          }),
        ),
      ).toBeNull();
    });
  });

  describe("duplicateChargeDetector", () => {
    it("fires on same merchant, same amount, within 24h", () => {
      const at = new Date("2026-05-20T12:00:00.000Z");
      const verdict = duplicateChargeDetector.detect(
        ctx({
          transaction: aTransaction({
            merchantName: "Starbucks",
            amount: Money.of(575, "USD"),
            occurredAt: at,
          }),
          recentSameMerchant: [
            aTransaction({
              merchantName: "Starbucks",
              amount: Money.of(575, "USD"),
              occurredAt: new Date(at.getTime() - 60 * 60 * 1000),
            }),
          ],
        }),
      );
      expect(verdict?.reason).toBe("duplicate_charge");
    });

    it("does not fire when amounts differ", () => {
      const at = new Date("2026-05-20T12:00:00.000Z");
      expect(
        duplicateChargeDetector.detect(
          ctx({
            transaction: aTransaction({
              amount: Money.of(575, "USD"),
              occurredAt: at,
            }),
            recentSameMerchant: [
              aTransaction({
                amount: Money.of(600, "USD"),
                occurredAt: new Date(at.getTime() - 60 * 60 * 1000),
              }),
            ],
          }),
        ),
      ).toBeNull();
    });
  });

  describe("newSubscriptionDetector", () => {
    it("fires on a recurring-looking charge with no merchant history", () => {
      const verdict = newSubscriptionDetector.detect(
        ctx({
          transaction: aTransaction({
            merchantName: "Spotify",
            isSubscription: true,
          }),
          merchantHistoryMinorUnits: [],
        }),
      );
      expect(verdict?.reason).toBe("new_subscription");
    });

    it("does not fire when merchant has prior history", () => {
      expect(
        newSubscriptionDetector.detect(
          ctx({
            transaction: aTransaction({ isRecurring: true }),
            merchantHistoryMinorUnits: [999],
          }),
        ),
      ).toBeNull();
    });
  });

  describe("unusualSpendDetector", () => {
    const categoryBaseline: SpendBaseline = {
      userId,
      category: "dining",
      period: "weekly",
      mean: Money.of(3000, "USD"),
      median: Money.of(3000, "USD"),
      stddevMinorUnits: 500,
      sampleCount: 10,
      computedAt: new Date(),
    };

    it("fires when spend exceeds mean + 3σ", () => {
      const verdict = unusualSpendDetector.detect(
        ctx({
          transaction: aTransaction({
            category: "dining",
            amount: Money.of(5000, "USD"),
          }),
          categoryBaseline,
        }),
      );
      expect(verdict?.reason).toBe("unusual_spend");
    });

    it("is suppressed when baseline sample size is too small", () => {
      expect(
        unusualSpendDetector.detect(
          ctx({
            transaction: aTransaction({ amount: Money.of(99999, "USD") }),
            categoryBaseline: { ...categoryBaseline, sampleCount: 2 },
          }),
        ),
      ).toBeNull();
    });
  });
});
