import { NotFoundError } from "../errors.js";
import { newId } from "../ids.js";
import type { TransactionId, UserId } from "../ids.js";
import type { Clock } from "../ports/clock.js";
import type { JobProducer } from "../ports/jobs.js";
import type { Logger } from "../ports/logger.js";
import type {
  AnomalyRepository,
  BaselineRepository,
  TransactionRepository,
} from "../ports/repositories.js";
import {
  makeAnomalyDetectors,
  type AnomalyDetectionConfig,
  type AnomalyDetector,
} from "../anomaly-detectors.js";
import type { Registry } from "../registry.js";
import type { AnomalyReason } from "../domain/anomaly.js";

export interface AnomalyDeps {
  transactions: TransactionRepository;
  baselines: BaselineRepository;
  anomalies: AnomalyRepository;
  queue: JobProducer;
  clock: Clock;
  log?: Logger;
  /** Injected at composition time from application config. */
  detectionConfig: AnomalyDetectionConfig;
  /** Optional override for tests; defaults to makeAnomalyDetectors(detectionConfig). */
  detectors?: Registry<AnomalyReason, AnomalyDetector>;
}

export function makeAnomalyService(deps: AnomalyDeps) {
  const detectors =
    deps.detectors ?? makeAnomalyDetectors(deps.detectionConfig);

  return {
    async run(payload: {
      userId: UserId;
      transactionId: TransactionId;
    }): Promise<void> {
      const log = deps.log?.child({ userId: payload.userId, transactionId: payload.transactionId });
      
      const txn = await deps.transactions.findById(
        payload.userId,
        payload.transactionId,
      );
      if (!txn) {
        log?.error("transaction not found");
        throw new NotFoundError(`transaction ${payload.transactionId}`);
      }

      log?.info("evaluating anomaly", {
        merchant: txn.merchantName ?? txn.merchantNameRaw,
        amount: txn.amount.toDisplayString(),
        category: txn.category,
      });

      const merchant = txn.merchantName ?? txn.merchantNameRaw;
      const historyMs = deps.detectionConfig.merchantHistoryDays * 24 * 60 * 60 * 1000;
      const since = new Date(deps.clock.now().getTime() - historyMs);
      const history = await deps.transactions.recentForMerchant(
        payload.userId,
        merchant,
        since,
      );
      const merchantHistoryMinorUnits = history
        .filter((t) => t.id !== txn.id)
        .map((t) => t.amount.minorUnits);

      const categoryBaseline =
        txn.category !== null
          ? await deps.baselines.get(payload.userId, txn.category, "weekly")
          : null;

      const ctx = {
        transaction: txn,
        recentSameMerchant: history.filter((t) => t.id !== txn.id),
        merchantHistoryMinorUnits,
        categoryBaseline,
      };

      let anomaliesDetected = 0;
      for (const detector of detectors.values()) {
        const verdict = detector.detect(ctx);
        if (!verdict) continue;

        anomaliesDetected++;
        log?.info("anomaly detected", {
          reason: verdict.reason,
          severity: verdict.severity,
        });

        const anomalyId = newId<"AnomalyId">();
        await deps.anomalies.create({
          id: anomalyId,
          userId: payload.userId,
          transactionId: txn.id,
          reason: verdict.reason,
          severity: verdict.severity,
          detail: verdict.detail,
          detectedAt: deps.clock.now(),
          deliveredAt: null,
        });

        if (verdict.severity === "high") {
          log?.debug("enqueuing delivery.send for high-severity anomaly");
          await deps.queue.enqueue("delivery.send", {
            userId: payload.userId,
            kind: "anomaly",
            refId: anomalyId,
          });
        }
      }
      
      if (anomaliesDetected === 0) {
        log?.info("no anomalies detected");
      }
    },
  };
}
