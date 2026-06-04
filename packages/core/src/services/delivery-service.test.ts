import { describe, it, expect } from "vitest";
import { makeDeliveryService } from "./delivery-service.js";
import { makeInMemoryRepositories } from "../testing/in-memory-repos.js";
import { makeCapturingChannel } from "../testing/capturing-channel.js";
import { makeDeliveryRouter } from "../delivery-router.js";
import { FixedClock } from "../testing/fixed-clock.js";
import { aUser } from "../testing/builders.js";
import { newId } from "../ids.js";
import { InvariantError } from "../errors.js";
import type { DigestFacts } from "../domain/digest-facts.js";

describe("makeDeliveryService", () => {
  it("delivers digests via email regardless of user SMS preference", async () => {
    const repos = makeInMemoryRepositories();
    const email = makeCapturingChannel("email");
    const sms = makeCapturingChannel("sms");
    const clock = new FixedClock();
    const user = aUser({ deliveryPreference: "sms" });
    repos._seed.user(user);

    const digestId = newId<"DigestId">();
    const facts: DigestFacts = {
      user: { firstName: "Alex", currency: "USD" },
      window: { startLabel: "May 19", endLabel: "May 25" },
      totalSpend: "$10.00",
      totalSpendVsBaseline: null,
      categories: [],
      anomalies: [],
      matchedReceipts: [],
      unmatchedReceipts: [],
      chargesMissingReceipts: [],
      maturity: "learning",
    };
    await repos.digests.create({
      id: digestId,
      userId: user.id,
      weekStart: new Date(),
      weekEnd: new Date(),
      facts,
      subject: "Weekly digest",
      content: "You spent $10.00",
      deliveredAt: null,
    });

    const svc = makeDeliveryService({
      users: repos.users,
      digests: repos.digests,
      reports: repos.reports,
      anomalies: repos.anomalies,
      router: makeDeliveryRouter([email, sms]),
      clock,
    });

    await svc.run({ userId: user.id, kind: "digest", refId: digestId });
    expect(email.sent).toHaveLength(1);
    expect(sms.sent).toHaveLength(0);
  });

  it("delivers anomalies via the user's preferred channel", async () => {
    const repos = makeInMemoryRepositories();
    const email = makeCapturingChannel("email");
    const sms = makeCapturingChannel("sms");
    const clock = new FixedClock();
    const user = aUser({ deliveryPreference: "sms" });
    repos._seed.user(user);

    const anomalyId = newId<"AnomalyId">();
    await repos.anomalies.create({
      id: anomalyId,
      userId: user.id,
      transactionId: newId<"TransactionId">(),
      reason: "duplicate_charge",
      severity: "high",
      detail: "Duplicate charge detected",
      detectedAt: new Date(),
      deliveredAt: null,
    });

    const svc = makeDeliveryService({
      users: repos.users,
      digests: repos.digests,
      reports: repos.reports,
      anomalies: repos.anomalies,
      router: makeDeliveryRouter([email, sms]),
      clock,
    });

    await svc.run({ userId: user.id, kind: "anomaly", refId: anomalyId });
    expect(sms.sent).toHaveLength(1);
  });

  it("throws when the preferred channel is not registered", async () => {
    const repos = makeInMemoryRepositories();
    const user = aUser({ deliveryPreference: "sms" });
    repos._seed.user(user);
    const anomalyId = newId<"AnomalyId">();
    await repos.anomalies.create({
      id: anomalyId,
      userId: user.id,
      transactionId: newId<"TransactionId">(),
      reason: "duplicate_charge",
      severity: "high",
      detail: "Duplicate charge detected",
      detectedAt: new Date(),
      deliveredAt: null,
    });

    const svc = makeDeliveryService({
      users: repos.users,
      digests: repos.digests,
      reports: repos.reports,
      anomalies: repos.anomalies,
      router: makeDeliveryRouter([makeCapturingChannel("email")]),
      clock: new FixedClock(),
    });

    await expect(
      svc.run({ userId: user.id, kind: "anomaly", refId: anomalyId }),
    ).rejects.toThrow(InvariantError);
  });
});
