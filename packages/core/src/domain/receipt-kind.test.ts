import { describe, it, expect } from "vitest";
import {
  isExcludedReceiptKind,
  shouldMatchReceiptToPlaid,
  RECEIPT_KINDS,
} from "./receipt-kind.js";

describe("ReceiptKind", () => {
  it("lists all kinds in the closed enum", () => {
    expect(RECEIPT_KINDS).toContain("order_confirmation");
    expect(RECEIPT_KINDS).toContain("unknown");
    expect(RECEIPT_KINDS.length).toBe(14);
  });

  it("excludes marketing and bank alerts from parsing", () => {
    expect(isExcludedReceiptKind("marketing")).toBe(true);
    expect(isExcludedReceiptKind("bank_card_alert")).toBe(true);
    expect(isExcludedReceiptKind("order_confirmation")).toBe(false);
  });

  it("matches order-like kinds to Plaid", () => {
    expect(shouldMatchReceiptToPlaid("food_delivery")).toBe(true);
    expect(shouldMatchReceiptToPlaid("peer_transfer")).toBe(false);
    expect(shouldMatchReceiptToPlaid("unknown")).toBe(false);
  });
});
