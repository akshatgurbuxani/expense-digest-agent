import { describe, it, expect } from "vitest";
import { Money, ValidationError } from "@expense/core";
import {
  assertAmountsPresentInSource,
  normalizeReceiptCorpus,
} from "./receipt-amount-validate.js";

describe("assertAmountsPresentInSource", () => {
  it("accepts amounts that appear in plain text", () => {
    expect(() =>
      assertAmountsPresentInSource(
        { textPlain: "Order total: $45.99", textHtml: null },
        [Money.fromDecimalString("45.99", "USD")],
      ),
    ).not.toThrow();
  });

  it("accepts amounts found in stripped HTML", () => {
    expect(() =>
      assertAmountsPresentInSource(
        {
          textPlain: null,
          textHtml: "<p>Total: <strong>$18.75</strong></p>",
        },
        [Money.fromDecimalString("18.75", "USD")],
      ),
    ).not.toThrow();
  });

  it("rejects invented totals", () => {
    expect(() =>
      assertAmountsPresentInSource(
        { textPlain: "Thanks for shopping.", textHtml: null },
        [Money.fromDecimalString("45.99", "USD")],
      ),
    ).toThrow(ValidationError);
  });
});

describe("normalizeReceiptCorpus", () => {
  it("combines plain and html bodies", () => {
    const corpus = normalizeReceiptCorpus({
      textPlain: "hello",
      textHtml: "<div>world</div>",
    });
    expect(corpus).toContain("hello");
    expect(corpus).toContain("world");
  });
});
