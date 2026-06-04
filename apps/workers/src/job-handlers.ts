import type { JobConsumer } from "@expense/core";
import type { Services } from "@expense/wiring";

/** Register domain services as job handlers — one line per job type. */
export function registerJobHandlers(
  queue: JobConsumer,
  services: Services,
): void {
  queue.process("txn.sync", (payload) => services.sync.run(payload));
  queue.process("txn.categorize", (payload) => services.categorize.run(payload));
  queue.process("anomaly.evaluate", (payload) => services.anomaly.run(payload));
  queue.process("baseline.recompute", (payload) => services.baseline.run(payload));
  queue.process("digest.generate", (payload) => services.digest.run(payload));
  queue.process("report.generate", (payload) => services.report.run(payload));
  queue.process("delivery.send", (payload) => services.delivery.run(payload));
  queue.process("mail.sync", (payload) => services.mailSync.run(payload));
  queue.process("mail.fullSync", (payload) => services.mailFullSync.run(payload));
  queue.process("mail.watch", (payload) => services.mailWatch.run(payload));
  queue.process("receipt.parse", (payload) => services.receiptParse.run(payload));
  queue.process("receipt.match", (payload) => services.receiptMatch.run(payload));
}
