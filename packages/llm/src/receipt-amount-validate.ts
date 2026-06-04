import { Money, ValidationError } from "@expense/core";

export interface ReceiptBodySource {
  readonly textPlain: string | null;
  readonly textHtml: string | null;
}

/** Ensures extracted monetary fields appear in the email body — no invented totals. */
export function assertAmountsPresentInSource(
  source: ReceiptBodySource,
  amounts: readonly (Money | null)[],
): void {
  const corpus = normalizeReceiptCorpus(source);
  const present = amounts.filter((amount): amount is Money => amount !== null);

  for (const amount of present) {
    if (!corpusContainsAmount(corpus, amount)) {
      throw new ValidationError(
        `extracted amount ${amount.toDisplayString()} not found in email body`,
        { amount: amount.toDisplayString() },
      );
    }
  }
}

export function normalizeReceiptCorpus(source: ReceiptBodySource): string {
  const plain = source.textPlain ?? "";
  const html =
    source.textHtml
      ?.replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ") ?? "";
  return `${plain}\n${html}`.toLowerCase();
}

function corpusContainsAmount(corpus: string, amount: Money): boolean {
  const decimal = amount.toDecimalString();
  const absDecimal = decimal.replace(/^-/, "");
  const display = amount.toDisplayString().toLowerCase();
  const absDisplay = display.replace(/^-/, "");

  const tokens = new Set([
    display,
    absDisplay,
    decimal,
    absDecimal,
    `$${decimal}`,
    `$${absDecimal}`,
  ]);

  for (const token of tokens) {
    if (corpus.includes(token.toLowerCase())) return true;
  }
  return false;
}
