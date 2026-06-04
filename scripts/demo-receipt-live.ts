#!/usr/bin/env tsx
/**
 * Live sandbox demo — real Gmail (+ optional Plaid sandbox + Claude).
 *
 * Requires DEMO_LIVE=1 and credentials in .env. See docs/demo-harness.md.
 *
 * Usage:
 *   DEMO_LIVE=1 npm run demo:live
 *   DEMO_LIVE=1 npm run demo:live -- --with-plaid --charge-amount 45.99 --charge-merchant Amazon
 *   DEMO_LIVE=1 npm run demo:live -- --incremental
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { UserId } from "@expense/core";
import { loadConfig, makeSystemClock } from "@expense/config";
import {
  gmailIntegrationEnabled,
  sandboxRefreshToken,
} from "@expense/gmail/testing";
import { claudeIntegrationEnabled } from "@expense/llm/testing";
import {
  plaidIntegrationEnabled,
  seedAccountOnTestRepos,
  setupPlaidSandboxForLiveDemo,
} from "@expense/plaid/testing";
import { buildWorkerContainer } from "@expense/workers/composition-root";
import { registerJobHandlers } from "@expense/workers/job-handlers";
import { aUser } from "../packages/core/src/testing/builders.js";
import {
  makeInMemoryRepositories,
  type TestRepositories,
} from "../packages/core/src/testing/in-memory-repos.js";

interface CliOptions {
  readonly withPlaid: boolean;
  readonly incremental: boolean;
  readonly outputDir: string;
  readonly chargeAmount: number;
  readonly chargeMerchant: string;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let withPlaid = false;
  let incremental = false;
  let outputDir = "demo-output/live";
  let chargeAmount = 45.99;
  let chargeMerchant = "Amazon";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--with-plaid") withPlaid = true;
    else if (arg === "--incremental") incremental = true;
    else if (arg === "--output" && argv[i + 1]) {
      outputDir = argv[i + 1]!;
      i += 1;
    } else if (arg === "--charge-amount" && argv[i + 1]) {
      chargeAmount = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--charge-merchant" && argv[i + 1]) {
      chargeMerchant = argv[i + 1]!;
      i += 1;
    }
  }

  return { withPlaid, incremental, outputDir, chargeAmount, chargeMerchant };
}

function assertLiveEnv(withPlaid: boolean): void {
  if (process.env.DEMO_LIVE !== "1") {
    throw new Error(
      "Set DEMO_LIVE=1 to run the live sandbox demo (safety gate).",
    );
  }
  if (!gmailIntegrationEnabled()) {
    throw new Error(
      "Gmail sandbox not configured. Set GMAIL_INTEGRATION=true, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_TEST_REFRESH_TOKEN.",
    );
  }
  if (!process.env.GMAIL_TEST_ADDRESS) {
    throw new Error("Set GMAIL_TEST_ADDRESS to the connected Gmail account.");
  }
  if (withPlaid && !plaidIntegrationEnabled()) {
    throw new Error(
      "Plaid sandbox not configured. Set PLAID_CLIENT_ID and PLAID_SECRET, or omit --with-plaid.",
    );
  }
}

async function listLinks(repos: TestRepositories, userId: UserId) {
  const txns = await repos.transactions.listForUser(userId);
  const links = [];
  for (const txn of txns) {
    const link = await repos.transactionReceiptLinks.findByTransactionId(
      userId,
      txn.id,
    );
    if (link) links.push(link);
  }
  return links;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  assertLiveEnv(opts.withPlaid);

  const container = buildWorkerContainer({
    config: loadConfig(),
    clock: makeSystemClock(),
    repos: makeInMemoryRepositories(),
  });
  registerJobHandlers(container.consumer, container.services);

  const repos = container.repos as TestRepositories;
  const gmailAddress = process.env.GMAIL_TEST_ADDRESS!;
  const user = aUser({
    timezone: "UTC",
    email: gmailAddress,
  });
  repos._seed.user(user);

  const mailAccount = await repos.mailAccounts.create(
    { userId: user.id, gmailAddress },
    sandboxRefreshToken(),
  );

  let plaidItemId: string | null = null;
  if (opts.withPlaid) {
    const plaid = await setupPlaidSandboxForLiveDemo({
      bank: container.bank,
      items: repos.items,
      accounts: repos.accounts,
      seedAccount: (account) => seedAccountOnTestRepos(repos, account),
      userId: user.id,
      charge: {
        amountDollars: opts.chargeAmount,
        description: opts.chargeMerchant,
      },
    });
    plaidItemId = plaid.itemId;
    console.log(
      `[plaid] sandbox item ${plaidItemId} — injected $${opts.chargeAmount.toFixed(2)} ${opts.chargeMerchant}`,
    );
    await container.services.sync.run({ userId: user.id, itemId: plaid.itemId });
  }

  if (opts.incremental) {
    console.log("[gmail] running incremental mail.sync …");
    await container.services.mailSync.run({
      userId: user.id,
      mailAccountId: mailAccount.id,
    });
  } else {
    console.log("[gmail] running mail.fullSync (30-day backfill) …");
    await container.services.mailFullSync.run({
      userId: user.id,
      mailAccountId: mailAccount.id,
    });
  }

  console.log("[workers] draining job queue …");
  await container.drain!(container.log);

  const messages = repos.listMailMessagesForUser(user.id);
  const receipts = repos.listReceiptsForUser(user.id);
  const links = await listLinks(repos, user.id);

  const report = {
    ranAt: new Date().toISOString(),
    gmailAddress,
    usedPlaid: opts.withPlaid,
    usedClaude: claudeIntegrationEnabled(),
    plaidItemId,
    messages: messages.length,
    receipts: receipts.length,
    links: links.length,
    rows: messages.map((message) => ({
      gmailMessageId: message.gmailMessageId,
      subject: message.subject,
      processingStatus: message.processingStatus,
      receiptKind: message.receiptKind,
      ignoreReason: message.ignoreReason,
    })),
    matched: links.map((link) => ({
      receiptId: link.receiptId,
      transactionId: link.transactionId,
      matchScore: link.matchScore,
      matchReason: link.matchReason,
    })),
  };

  const outputRoot = path.resolve(opts.outputDir);
  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    path.join(outputRoot, "live-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.log("\n--- Live demo summary ---");
  console.log(`Gmail:   ${gmailAddress}`);
  console.log(`Claude:  ${report.usedClaude ? "yes" : "no (fake extractor)"}`);
  console.log(`Plaid:   ${report.usedPlaid ? "yes" : "no"}`);
  console.log(`Messages ingested: ${report.messages}`);
  console.log(`Receipts parsed:   ${report.receipts}`);
  console.log(`Links created:     ${report.links}`);
  console.log(`\nReport: ${path.join(outputRoot, "live-report.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
