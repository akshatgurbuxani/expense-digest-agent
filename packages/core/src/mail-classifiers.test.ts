import { describe, it, expect } from "vitest";
import {
  classifyMail,
  makeMailClassifiers,
  parseFromDomain,
  toClassificationInput,
} from "./mail-classifiers.js";

const classifiers = makeMailClassifiers({ blockBankCardAlerts: true });

describe("mail classifiers", () => {
  describe("blocklist-bank-alert", () => {
    it("ignores known bank alert senders", () => {
      const result = classifyMail(
        toClassificationInput({
          fromAddress: "Chase <alerts@chase.com>",
          subject: "Your purchase",
          snippet: null,
        }),
        classifiers,
      );
      expect(result).toEqual({
        outcome: "ignore",
        reason: "bank_card_alert_from",
      });
    });

    it("classifies card alert subject patterns", () => {
      const result = classifyMail(
        toClassificationInput({
          fromAddress: "Bank <notice@example.com>",
          subject: "Transaction alert on card ending 1234",
          snippet: null,
        }),
        classifiers,
      );
      expect(result).toEqual({
        outcome: "classify",
        kind: "bank_card_alert",
      });
    });
  });

  describe("blocklist-marketing", () => {
    it("classifies promotional subjects as marketing", () => {
      const result = classifyMail(
        toClassificationInput({
          fromAddress: "Shop <shop@store.com>",
          subject: "50% off — sale ends tonight",
          snippet: null,
        }),
        classifiers,
      );
      expect(result).toEqual({ outcome: "classify", kind: "marketing" });
    });
  });

  describe("domain-rules", () => {
    it("classifies Amazon order confirmations", () => {
      const result = classifyMail(
        toClassificationInput({
          fromAddress: "Amazon <order-update@amazon.com>",
          subject: "Your Amazon.com order has shipped",
          snippet: null,
        }),
        classifiers,
      );
      expect(result).toEqual({
        outcome: "classify",
        kind: "order_confirmation",
      });
    });

    it("classifies DoorDash as food delivery", () => {
      const result = classifyMail(
        toClassificationInput({
          fromAddress: "DoorDash <noreply@doordash.com>",
          subject: "Your receipt from Chipotle",
          snippet: null,
        }),
        classifiers,
      );
      expect(result).toEqual({ outcome: "classify", kind: "food_delivery" });
    });

    it("classifies Lyft as rideshare", () => {
      const result = classifyMail(
        toClassificationInput({
          fromAddress: "Lyft <receipts@lyft.com>",
          subject: "Your ride receipt",
          snippet: null,
        }),
        classifiers,
      );
      expect(result).toEqual({ outcome: "classify", kind: "rideshare" });
    });
  });

  it("defaults to unknown when no rule matches", () => {
    const result = classifyMail(
      toClassificationInput({
        fromAddress: "Someone <person@example.org>",
        subject: "Hello",
        snippet: null,
      }),
      classifiers,
    );
    expect(result).toEqual({ outcome: "classify", kind: "unknown" });
  });

  it("parses from domain from angle-addr", () => {
    expect(parseFromDomain("Amazon <order-update@amazon.com>")).toBe(
      "amazon.com",
    );
  });
});
