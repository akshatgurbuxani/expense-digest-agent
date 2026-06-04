import type { DigestFacts } from "@expense/core";
import { collectMoneyStringsFromFacts } from "@expense/core";

/** Wrap digest prose in HTML — embeds provided figures verbatim, no arithmetic. */
export function renderDigestHtml(prose: string, facts: DigestFacts): string {
  const figures = [...collectMoneyStringsFromFacts(facts)];
  const figureItems = figures
    .map((f) => `<li>${escapeHtml(f)}</li>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Weekly digest</title></head>
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
