import type { MonthlyReportFacts } from "@expense/core";
import { collectMoneyStringsFromMonthlyReportFacts } from "@expense/core";

/** Wrap monthly report prose in HTML — embeds provided figures verbatim. */
export function renderMonthlyReportHtml(
  prose: string,
  facts: MonthlyReportFacts,
): string {
  const figures = [...collectMoneyStringsFromMonthlyReportFacts(facts)];
  const figureItems = figures
    .map((f) => `<li>${escapeHtml(f)}</li>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Monthly report</title></head>
<body>
  <article>${escapeHtml(prose).replace(/\n/g, "<br>\n")}</article>
  <footer aria-label="Figures provided">
    <ul>${figureItems}</ul>
  </footer>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
