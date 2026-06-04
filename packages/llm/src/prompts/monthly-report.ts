import type { MonthlyReportFacts } from "@expense/core";
import { z } from "zod";

export const MonthlyReportResponseSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

export type MonthlyReportResponse = z.infer<typeof MonthlyReportResponseSchema>;

export function buildMonthlyReportPrompt(facts: MonthlyReportFacts): string {
  return [
    "Write a clear monthly expense report email.",
    "Use ONLY the monetary figures provided in the facts JSON below.",
    "Do NOT invent, recompute, or round any dollar amounts.",
    "Cover total spend, category breakdown, matched receipts, unmatched receipts,",
    "and charges missing order emails when those sections are non-empty.",
    "Use pre-written reasonDetail and detail strings for unmatched/missing items.",
    "Return JSON with subject and body (plain text, not HTML).",
    "",
    "Facts JSON:",
    JSON.stringify(facts, null, 2),
  ].join("\n");
}
