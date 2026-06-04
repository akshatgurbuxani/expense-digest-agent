import { Money } from "../money.js";
import { newId } from "../ids.js";
import type { MailAccountId, UserId } from "../ids.js";
import { aTransaction } from "./builders.js";
import { makeFakeMailProvider } from "./fake-mail.js";
import { makeMailPipelineHarness, type MailPipelineHarness } from "./mail-pipeline.harness.js";
import {
  mailOptionsForScenario,
  type ReceiptPipelineScenario,
} from "./receipt-scenarios.js";

export interface ReceiptPipelineScenarioRun {
  readonly harness: MailPipelineHarness;
  readonly userId: UserId;
  readonly mailAccountId: MailAccountId;
  readonly scenario: ReceiptPipelineScenario;
}

/** Run one declarative scenario through the in-memory mail job chain. */
export async function runReceiptPipelineScenario(
  scenario: ReceiptPipelineScenario,
): Promise<ReceiptPipelineScenarioRun> {
  const harness = makeMailPipelineHarness({
    mail: makeFakeMailProvider(mailOptionsForScenario(scenario)),
  });
  const userId = newId<"UserId">();
  const { mailAccountId } = await harness.setupUser({ userId });

  if (scenario.expiredHistoryId) {
    await harness.repos.mailAccounts.saveHistoryId(
      mailAccountId,
      scenario.expiredHistoryId,
      harness.clock.now(),
    );
  }

  for (const seed of scenario.seedTransactions ?? []) {
    harness.repos._seed.transaction(
      aTransaction({
        userId,
        merchantName: seed.merchantName,
        category: seed.category,
        amount: Money.of(seed.amountMinorUnits, "USD"),
        occurredAt: seed.occurredAt ?? new Date("2026-05-20T12:00:00.000Z"),
      }),
    );
  }

  await harness.runSync({ userId, mailAccountId });
  if (scenario.runSyncTwice) {
    await harness.runSync({ userId, mailAccountId });
  }

  return { harness, userId, mailAccountId, scenario };
}
