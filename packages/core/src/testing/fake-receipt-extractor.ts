import { Money } from "../money.js";
import { parseFromDomain } from "../mail-classifiers.js";
import type {
  ReceiptExtractionInput,
  ReceiptExtractionResult,
  ReceiptExtractor,
} from "../ports/receipt-extractor.js";

const URL_RE = /(?:(?:Order\s*URL|View\s*(?:order|details)?)\s*:\s*)?(https?:\/\/[^\s]+)/i;
const ITEMS_HEADER_RE = /^(?:items|order\s*includes|purchased)\s*:/im;

export interface FakeReceiptExtractorOptions {
  readonly results?: Record<string, ReceiptExtractionResult>;
  readonly defaultConfidence?: number;
}

/** Deterministic ReceiptExtractor for tests. */
export function makeFakeReceiptExtractor(
  opts: FakeReceiptExtractorOptions = {},
): ReceiptExtractor {
  return {
    async extract(input): Promise<ReceiptExtractionResult> {
      const key = `${input.fromAddress}:${input.subject}`;
      const preset = opts.results?.[key];
      if (preset) return preset;

      const domain = parseFromDomain(input.fromAddress);
      const orderMatch = input.subject.match(/order[#:\s-]*([A-Z0-9-]+)/i);
      const body = input.textPlain ?? input.textHtml ?? "";
      const amountMatch = body.match(/\$(\d+(?:\.\d{2})?)/);
      const totalAmount = amountMatch
        ? Money.fromDecimalString(amountMatch[1]!, "USD")
        : null;

      const orderUrl = extractOrderUrl(body);
      const lineItems = extractLineItems(body);

      return {
        merchantName: domain.split(".")[0] ?? "Unknown",
        merchantDomain: domain || null,
        orderId: orderMatch?.[1] ?? null,
        orderUrl,
        totalAmount,
        occurredAt: input.receivedAt,
        lineItems,
        confidence: opts.defaultConfidence ?? 0.85,
        source: "heuristic",
      };
    },
  };
}

/** Scan email body for an order URL. */
function extractOrderUrl(body: string): string | null {
  const m = body.match(URL_RE);
  if (m) return m[1]!;
  return null;
}

/** Parse simple line items from email body. */
function extractLineItems(
  body: string,
): readonly { description: string; quantity: number | null; amount: Money | null }[] {
  const items: { description: string; quantity: number | null; amount: Money | null }[] = [];

  const parts = body.split(ITEMS_HEADER_RE);
  if (parts.length < 2) return items;

  const afterHeader = parts[1]!.split(/\n/).slice(0, 10);
  for (const line of afterHeader) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Order total") || trimmed.startsWith("Order URL") || trimmed.startsWith("http")) continue;

    const amtMatch = trimmed.match(/\$(\d+(?:\.\d{2})?)/);
    const description = amtMatch ? trimmed.replace(/\$[\d.]+/, "").trim() : trimmed;
    const amount = amtMatch ? Money.fromDecimalString(amtMatch[1]!, "USD") : null;

    if (description) {
      items.push({ description, quantity: 1, amount });
    }
  }

  return items;
}

/** Build a keyed preset map for fake extractor scenarios. */
export function fakeReceiptResult(
  input: ReceiptExtractionInput,
  result: ReceiptExtractionResult,
): { key: string; result: ReceiptExtractionResult } {
  return {
    key: `${input.fromAddress}:${input.subject}`,
    result,
  };
}
