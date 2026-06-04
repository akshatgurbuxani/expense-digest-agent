import { describe, it, expect } from "vitest";
import { RECEIPT_PIPELINE_SCENARIOS } from "./receipt-scenarios.js";
import { runReceiptPipelineScenario } from "./receipt-scenario-runner.js";
import { TEST_RECEIPT_MATCH_CONFIG } from "./tunables.js";

describe("receipt pipeline scenarios", () => {
  for (const scenario of RECEIPT_PIPELINE_SCENARIOS) {
    it(`${scenario.id}: ${scenario.description}`, async () => {
      const { harness, userId, mailAccountId } =
        await runReceiptPipelineScenario(scenario);
      const { expect: expected } = scenario;

      if (expected.fullSyncEnqueued !== undefined) {
        expect(harness.queue.jobs.some((j) => j.name === "mail.fullSync")).toBe(
          expected.fullSyncEnqueued,
        );
      }

      const message = await harness.repos.mailMessages.findByGmailMessageId(
        userId,
        mailAccountId,
        scenario.gmailMessageId,
      );
      expect(message).not.toBeNull();
      expect(message?.processingStatus).toBe(expected.processingStatus);
      expect(message?.receiptKind).toBe(expected.receiptKind);

      if (expected.ignoreReasonContains) {
        expect(message?.ignoreReason).toContain(expected.ignoreReasonContains);
      }

      const receipt = message
        ? await harness.repos.receipts.findByMailMessageId(userId, message.id)
        : null;

      if (expected.receiptExists) {
        expect(receipt).not.toBeNull();
        if (expected.totalAmountMinorUnits === null) {
          expect(receipt?.totalAmount).toBeNull();
        } else if (expected.totalAmountMinorUnits !== undefined) {
          expect(receipt?.totalAmount?.minorUnits).toBe(
            expected.totalAmountMinorUnits,
          );
        }
      } else {
        expect(receipt).toBeNull();
      }

      const anyLink = receipt
        ? await harness.repos.transactionReceiptLinks.findByReceiptId(
            userId,
            receipt.id,
          )
        : null;

      if (expected.linked) {
        expect(anyLink).not.toBeNull();
        expect(anyLink?.matchScore).toBeGreaterThanOrEqual(
          TEST_RECEIPT_MATCH_CONFIG.minScore,
        );
      } else {
        expect(anyLink).toBeNull();
      }

      if (scenario.runSyncTwice && receipt) {
        const parseJobs = harness.queue.jobs.filter(
          (j) => j.name === "receipt.parse",
        );
        expect(parseJobs).toHaveLength(1);
      }
    });
  }
});
