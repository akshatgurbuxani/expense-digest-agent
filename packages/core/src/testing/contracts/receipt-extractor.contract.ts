import { describe, it, expect } from "vitest";
import { Money } from "../../money.js";
import type {
  ReceiptExtractionInput,
  ReceiptExtractor,
} from "../../ports/receipt-extractor.js";

const sampleInput = (): ReceiptExtractionInput => ({
  kind: "order_confirmation",
  fromAddress: "Amazon <order-update@amazon.com>",
  subject: "Your order #123-4567890",
  textPlain: "Order total: $45.99\nThank you for shopping.",
  textHtml: null,
  receivedAt: new Date("2026-05-20T18:00:00.000Z"),
});

/** Shared contract every ReceiptExtractor adapter must satisfy. */
export function receiptExtractorContract(
  makeExtractor: () => ReceiptExtractor,
  label: string,
) {
  describe(`ReceiptExtractor contract (${label})`, () => {
    it("returns merchant name and confidence", async () => {
      const extractor = makeExtractor();
      const result = await extractor.extract(sampleInput());

      expect(result.merchantName.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(["heuristic", "llm"]).toContain(result.source);
    });

    it("extracts monetary totals present in the body when possible", async () => {
      const extractor = makeExtractor();
      const result = await extractor.extract(sampleInput());

      expect(result.totalAmount).not.toBeNull();
      expect(result.totalAmount?.minorUnits).toBe(4599);
      expect(result.totalAmount?.currency).toBe("USD");
    });

    it("does not invent amounts absent from the input", async () => {
      const extractor = makeExtractor();
      const result = await extractor.extract({
        ...sampleInput(),
        textPlain: "Thanks for your purchase.",
        textHtml: null,
      });

      expect(result.totalAmount).toBeNull();
    });
  });
}

export function assertExtractedMoney(
  result: Awaited<ReturnType<ReceiptExtractor["extract"]>>,
  expectedMinor: number,
): void {
  expect(result.totalAmount).toEqual(Money.of(expectedMinor, "USD"));
}
