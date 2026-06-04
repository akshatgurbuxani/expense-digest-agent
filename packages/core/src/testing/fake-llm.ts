import { CATEGORIES, type Category } from "../domain/category.js";
import type { DigestFacts } from "../domain/digest-facts.js";
import type { MonthlyReportFacts } from "../domain/monthly-report-facts.js";
import type { MerchantSignals } from "../domain/merchant-signals.js";
import type { LlmProvider, MerchantEnrichment } from "../ports/llm-provider.js";
import { ValidationError } from "../errors.js";

const KNOWN: Record<string, { merchantName: string; category: Category }> = {
  WHOLEFDS: { merchantName: "Whole Foods Market", category: "groceries" },
  NETFLIX: { merchantName: "Netflix", category: "subscriptions" },
  STARBUCKS: { merchantName: "Starbucks", category: "dining" },
};

/** Deterministic LlmProvider for tests and local dev (`LLM_FAKE=true`). */
export function makeFakeLlm(): LlmProvider {
  return {
    categorizeMerchant: async (input) => categorize(input),
    writeDigest: async (facts) => writeDigest(facts),
    writeMonthlyReport: async (facts) => writeMonthlyReport(facts),
  };
}

function categorize(input: {
  rawName: string;
  plaidPfc: string | null;
  amountHint: string;
}): MerchantEnrichment {
  const key = input.rawName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
  const hit = Object.entries(KNOWN).find(([k]) => key.includes(k))?.[1];
  const merchantName = hit?.merchantName ?? titleCase(input.rawName);
  const category = hit?.category ?? "other";
  if (!CATEGORIES.includes(category)) {
    throw new ValidationError(`fake llm produced invalid category: ${category}`);
  }
  const signals: MerchantSignals = {
    isSubscription: category === "subscriptions",
    isRecurring: category === "subscriptions",
    confidence: hit ? 0.95 : 0.7,
  };
  return { merchantName, category, signals };
}

function parseDisplayAmount(display: string): number {
  return Number(display.replace(/[^0-9.]/g, "")) || 0;
}

function writeCategoryBreakdown(
  sections: string[],
  categories: DigestFacts["categories"],
): void {
  const maxAmount = Math.max(...categories.map((c) => parseDisplayAmount(c.amount)), 1);
  const barMax = 20;
  const catLines = ["CATEGORY BREAKDOWN"];
  for (const c of categories) {
    const width = Math.max(1, Math.round((parseDisplayAmount(c.amount) / maxAmount) * barMax));
    const bar = "\u2588".repeat(width).padEnd(barMax);
    const label = c.category.padEnd(16);
    catLines.push(`  ${label} ${c.amount.padStart(8)} ${c.share.padStart(4)}  ${bar}`);
  }
  sections.push(catLines.join("\n"));
}

function writeMatchedReceipts(
  sections: string[],
  matched: DigestFacts["matchedReceipts"],
  emptyMessage?: string,
): void {
  if (matched.length > 0) {
    const lines = [`RECEIPTS MATCHED TO CHARGES (${matched.length})`];
    for (const r of matched) {
      const amount = r.receiptAmount ?? r.chargeAmount;
      lines.push(`  \u2022 ${r.merchantName}${amount ? ` \u2014 ${amount}` : ""}`);
      for (const li of r.lineItems) {
        lines.push(`    ${li.description}${li.amount ? ` (${li.amount})` : ""}`);
      }
      if (r.orderUrl) {
        lines.push(`    Order: ${r.orderUrl}`);
      }
    }
    sections.push(lines.join("\n"));
  } else if (emptyMessage) {
    sections.push(emptyMessage);
  }
}

function writeUnmatchedReceipts(
  sections: string[],
  unmatched: DigestFacts["unmatchedReceipts"],
): void {
  if (unmatched.length > 0) {
    const lines = ["UNMATCHED RECEIPTS"];
    for (const u of unmatched) {
      const amt = u.amount ?? "unknown amount";
      lines.push(`  \u2022 Receipt from "${u.merchantName}" for ${amt} \u2014 ${u.reasonDetail}`);
    }
    sections.push(lines.join("\n"));
  }
}

function writeChargesMissingReceipts(
  sections: string[],
  missing: DigestFacts["chargesMissingReceipts"],
): void {
  if (missing.length > 0) {
    const lines = ["CHARGES WITH NO RECEIPT"];
    for (const c of missing) {
      lines.push(`  \u2022 ${c.merchantName} \u2014 ${c.amount}`);
    }
    sections.push(lines.join("\n"));
  }
}

function writeDigest(facts: DigestFacts): { subject: string; body: string } {
  const name = facts.user.firstName ?? "there";
  const sections: string[] = [];

  sections.push(`Hi ${name},\n\nHere's your weekly spending recap for ${facts.window.startLabel} – ${facts.window.endLabel}.`);

  const overview = [`OVERVIEW`, `You spent ${facts.totalSpend} this week.`];
  if (facts.totalSpendVsBaseline) {
    const t = facts.totalSpendVsBaseline;
    const direction = t.direction === "up" ? "higher" : t.direction === "down" ? "lower" : "on par with";
    overview.push(`That's ${t.percent} ${direction} than your typical ${t.baselineAmount}.`);
  }
  if (facts.maturity === "learning") {
    overview.push("I'm still learning your spending patterns — baselines will improve over time.");
  }
  sections.push(overview.join("\n"));

  writeCategoryBreakdown(sections, facts.categories);

  if (facts.anomalies.length > 0) {
    const lines = ["ANOMALIES DETECTED"];
    for (const a of facts.anomalies) {
      lines.push(`  \u2022 ${a.detail}${a.amount ? ` (${a.amount})` : ""}`);
    }
    sections.push(lines.join("\n"));
  }

  writeMatchedReceipts(sections, facts.matchedReceipts);
  writeUnmatchedReceipts(sections, facts.unmatchedReceipts);
  writeChargesMissingReceipts(sections, facts.chargesMissingReceipts);

  return {
    subject: `Your week in spending \u2014 ${facts.window.endLabel}`,
    body: sections.join("\n\n"),
  };
}

function writeMonthlyReport(
  facts: MonthlyReportFacts,
): { subject: string; body: string } {
  const name = facts.user.firstName ?? "there";
  const sections: string[] = [];

  sections.push(`Hi ${name},\n\nHere's your expense report for ${facts.window.monthLabel}.`);

  sections.push(`OVERVIEW\nYou spent ${facts.totalSpend} this month.`);

  writeCategoryBreakdown(sections, facts.categories);
  writeMatchedReceipts(sections, facts.matchedReceipts, "No matched order emails this month.");
  writeUnmatchedReceipts(sections, facts.unmatchedReceipts);
  writeChargesMissingReceipts(sections, facts.chargesMissingReceipts);

  return {
    subject: `Your ${facts.window.monthLabel} expense report`,
    body: sections.join("\n\n"),
  };
}

/** LLM that deliberately invents a figure — for money-contract rejection tests. */
export function makeAdversarialLlm(): LlmProvider {
  const inner = makeFakeLlm();
  return {
    categorizeMerchant: (input) => inner.categorizeMerchant(input),
    writeDigest: async (facts) => {
      const result = await inner.writeDigest(facts);
      return {
        subject: result.subject,
        body: `${result.body}\nIncluding $999.00 on snacks.`,
      };
    },
    writeMonthlyReport: async (facts) => {
      const result = await inner.writeMonthlyReport(facts);
      return {
        subject: result.subject,
        body: `${result.body}\nIncluding $999.00 on extras.`,
      };
    },
  };
}

function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Wraps an LlmProvider and counts invocations (for escalation-ladder tests). */
export function countingLlm(inner: LlmProvider): LlmProvider & { readonly calls: number } {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    categorizeMerchant: async (input) => {
      calls += 1;
      return inner.categorizeMerchant(input);
    },
    writeDigest: async (facts) => {
      calls += 1;
      return inner.writeDigest(facts);
    },
    writeMonthlyReport: async (facts) => {
      calls += 1;
      return inner.writeMonthlyReport(facts);
    },
  };
}
