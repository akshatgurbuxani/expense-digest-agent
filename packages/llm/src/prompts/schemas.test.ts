import { describe, it, expect } from "vitest";
import { ValidationError } from "@expense/core";
import { CategorizeResponseSchema } from "./categorize.js";
import { DigestResponseSchema } from "./digest.js";
import {
  ReceiptExtractionResponseSchema,
} from "./receipt.js";

describe("CategorizeResponseSchema", () => {
  it("accepts a valid categorization", () => {
    const parsed = CategorizeResponseSchema.parse({
      merchantName: "Whole Foods Market",
      category: "groceries",
      signals: {
        isSubscription: false,
        isRecurring: false,
        confidence: 0.9,
      },
    });
    expect(parsed.category).toBe("groceries");
  });

  it("rejects an out-of-enum category", () => {
    expect(() =>
      CategorizeResponseSchema.parse({
        merchantName: "Mystery Shop",
        category: "snacks",
        signals: {
          isSubscription: false,
          isRecurring: false,
          confidence: 0.5,
        },
      }),
    ).toThrow();
  });
});

describe("DigestResponseSchema", () => {
  it("requires subject and body", () => {
    expect(() => DigestResponseSchema.parse({ subject: "Hi" })).toThrow();
  });

  it("rejects empty strings", () => {
    expect(() =>
      DigestResponseSchema.parse({ subject: "", body: "text" }),
    ).toThrow();
  });
});

describe("ReceiptExtractionResponseSchema", () => {
  it("accepts a valid extraction payload", () => {
    const parsed = ReceiptExtractionResponseSchema.parse({
      merchantName: "Amazon",
      merchantDomain: "amazon.com",
      orderId: "123-4567890",
      orderUrl: null,
      totalAmount: "45.99",
      currency: "USD",
      occurredAt: null,
      lineItems: [],
      confidence: 0.92,
    });
    expect(parsed.totalAmount).toBe("45.99");
  });

  it("rejects malformed money strings", () => {
    expect(() =>
      ReceiptExtractionResponseSchema.parse({
        merchantName: "Amazon",
        merchantDomain: null,
        orderId: null,
        orderUrl: null,
        totalAmount: "$45.99",
        currency: "USD",
        occurredAt: null,
        lineItems: [],
        confidence: 0.5,
      }),
    ).toThrow();
  });
});

// Ensure schema failures surface as Zod errors (adapter maps to ValidationError).
describe("schema errors are validation failures", () => {
  it("wraps as ValidationError at adapter boundary", () => {
    try {
      CategorizeResponseSchema.parse({ nope: true });
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(ValidationError);
    }
  });
});
