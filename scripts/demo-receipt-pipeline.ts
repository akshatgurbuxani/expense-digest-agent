#!/usr/bin/env tsx
/**
 * Offline receipt pipeline demo — runs scenario catalog through the in-memory
 * harness and writes HTML + JSON artifacts under demo-output/.
 *
 * Usage:
 *   npm run demo:replay
 *   npm run demo:replay -- --scenario amazon-happy-path
 *   npm run demo:replay -- --output ./demo-output
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildDigestFacts,
  loadReceiptEnrichmentInput,
  weekWindowFor,
} from "@expense/core";
import { makeFakeLlm } from "../packages/core/src/testing/fake-llm.js";
import {
  RECEIPT_PIPELINE_SCENARIOS,
  receiptScenarioById,
} from "../packages/core/src/testing/receipt-scenarios.js";
import { runReceiptPipelineScenario } from "../packages/core/src/testing/receipt-scenario-runner.js";
import {
  TEST_DIGEST_FACTS_CONFIG,
  TEST_RECEIPT_MATCH_CONFIG,
} from "../packages/core/src/testing/tunables.js";
import { renderDigestHtml } from "@expense/delivery";

const DEFAULT_OUTPUT = "demo-output";

interface CliOptions {
  readonly scenarioIds: readonly string[];
  readonly outputDir: string;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let scenarioArg = "all";
  let outputDir = DEFAULT_OUTPUT;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--scenario" && argv[i + 1]) {
      scenarioArg = argv[i + 1]!;
      i += 1;
    } else if (arg === "--output" && argv[i + 1]) {
      outputDir = argv[i + 1]!;
      i += 1;
    }
  }

  const scenarioIds =
    scenarioArg === "all"
      ? RECEIPT_PIPELINE_SCENARIOS.map((s) => s.id)
      : scenarioArg.split(",").map((id) => id.trim()).filter(Boolean);

  return { scenarioIds, outputDir };
}

function resolveScenarios(ids: readonly string[]) {
  return ids.map((id) => receiptScenarioById(id));
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const outputRoot = path.resolve(opts.outputDir);
  const llm = makeFakeLlm();
  const receiptEnrichmentConfig = {
    matchConfig: TEST_RECEIPT_MATCH_CONFIG,
    minParseConfidence: 0.75,
    categoriesTriggerMatch: [...TEST_RECEIPT_MATCH_CONFIG.categoryBonusCategories],
  };

  await mkdir(outputRoot, { recursive: true });

  const indexEntries: { id: string; description: string; linked: boolean }[] = [];

  for (const scenario of resolveScenarios(opts.scenarioIds)) {
    const run = await runReceiptPipelineScenario(scenario);
    const { harness, userId, mailAccountId } = run;

    const message = await harness.repos.mailMessages.findByGmailMessageId(
      userId,
      mailAccountId,
      scenario.gmailMessageId,
    );
    const receipt = message
      ? await harness.repos.receipts.findByMailMessageId(userId, message.id)
      : null;
    const link = receipt
      ? await harness.repos.transactionReceiptLinks.findByReceiptId(
          userId,
          receipt.id,
        )
      : null;

    harness.clock.advance(60_000);
    const window = weekWindowFor("UTC", harness.clock.now());
    const transactions = await harness.repos.transactions.listInWindow(
      userId,
      window.start,
      window.end,
    );
    const receiptEnrichmentInput = await loadReceiptEnrichmentInput({
      receipts: harness.repos.receipts,
      mailMessages: harness.repos.mailMessages,
      transactionReceiptLinks: harness.repos.transactionReceiptLinks,
      userId,
      window,
      transactionsInWindow: transactions,
    });

    const facts = buildDigestFacts(
      {
        firstName: "Demo",
        currency: "USD",
        window: { startLabel: window.startLabel, endLabel: window.endLabel },
        transactions,
        baselines: [],
        anomalies: [],
        receiptEnrichment: {
          input: receiptEnrichmentInput,
          config: receiptEnrichmentConfig,
        },
      },
      TEST_DIGEST_FACTS_CONFIG,
    );

    const { subject, body } = await llm.writeDigest(facts);
    const html = renderDigestHtml(body, facts);

    const summary = {
      id: scenario.id,
      description: scenario.description,
      processingStatus: message?.processingStatus ?? null,
      receiptKind: message?.receiptKind ?? null,
      ignoreReason: message?.ignoreReason ?? null,
      receiptExists: receipt !== null,
      linked: link !== null,
      matchScore: link?.matchScore ?? null,
      digestSubject: subject,
      matchedReceipts: facts.matchedReceipts.length,
      unmatchedReceipts: facts.unmatchedReceipts.length,
      chargesMissingReceipts: facts.chargesMissingReceipts.length,
      matchedReceiptFacts: facts.matchedReceipts,
      unmatchedReceiptFacts: facts.unmatchedReceipts,
    };

    const scenarioDir = path.join(outputRoot, scenario.id);
    await mkdir(scenarioDir, { recursive: true });
    await writeFile(
      path.join(scenarioDir, "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
    await writeFile(path.join(scenarioDir, "digest.txt"), `${body}\n`, "utf8");
    await writeFile(path.join(scenarioDir, "digest.html"), html, "utf8");

    indexEntries.push({
      id: scenario.id,
      description: scenario.description,
      linked: link !== null,
    });

    console.log(
      `[${scenario.id}] status=${message?.processingStatus ?? "none"} linked=${link !== null} matched=${facts.matchedReceipts.length} unmatched=${facts.unmatchedReceipts.length}`,
    );
  }

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Receipt pipeline demo</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 52rem; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.5rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f5f5f5; }
    a { color: #0b57d0; }
    .ok { color: #137333; }
    .no { color: #b06000; }
  </style>
</head>
<body>
  <h1>Receipt pipeline replay</h1>
  <p>Generated offline from <code>RECEIPT_PIPELINE_SCENARIOS</code> — no Gmail, Plaid, or Claude.</p>
  <table>
    <thead><tr><th>Scenario</th><th>Description</th><th>Linked</th><th>Artifacts</th></tr></thead>
    <tbody>
${indexEntries
  .map(
    (entry) => `      <tr>
        <td><code>${escapeHtml(entry.id)}</code></td>
        <td>${escapeHtml(entry.description)}</td>
        <td class="${entry.linked ? "ok" : "no"}">${entry.linked ? "yes" : "no"}</td>
        <td><a href="./${escapeHtml(entry.id)}/digest.html">digest</a> · <a href="./${escapeHtml(entry.id)}/summary.json">summary</a></td>
      </tr>`,
  )
  .join("\n")}
    </tbody>
  </table>
</body>
</html>
`;

  await writeFile(path.join(outputRoot, "index.html"), indexHtml, "utf8");
  console.log(`\nWrote ${indexEntries.length} scenario(s) to ${outputRoot}/`);
  console.log(`Open ${path.join(outputRoot, "index.html")} in a browser.`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
