import { describe, it, expect, vi } from "vitest";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { ValidationError } from "@expense/core";
import { receiptExtractorContract } from "@expense/core/testing/contracts";
import {
  makeClaudeReceiptExtractor,
} from "./claude-receipt-extractor.js";
import { type ClaudeMessagesClient } from "./claude-llm-provider.js";
import {
  fixtureExtractionJson,
  RECEIPT_EMAIL_FIXTURES,
} from "./testing/receipt-fixtures.js";

function textMessage(text: string): Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text, citations: null }],
    model: "claude-test",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as Message;
}

const amazonFixture = RECEIPT_EMAIL_FIXTURES[0]!;

const FIXTURE_KINDS = [
  "order_confirmation",
  "rideshare",
  "food_delivery",
  "subscription_renewal",
  "travel_booking",
  "event_ticket",
  "marketplace_payment",
  "unknown",
  "refund",
  "invoice_bill",
  "shipping_update",
] as const;

describe("makeClaudeReceiptExtractor (mocked)", () => {
  receiptExtractorContract(
    () =>
      makeClaudeReceiptExtractor(
        { apiKey: "test-key", model: "claude-test", maxConcurrency: 1 },
        {
          client: {
            messages: {
              create: vi.fn(async (params) => {
                const content = String(
                  params.messages[0]?.content ?? "",
                ).toLowerCase();
                const hasAmount = content.includes("$45.99");
                const fixture = hasAmount
                  ? amazonFixture
                  : RECEIPT_EMAIL_FIXTURES.find(
                      (f) => f.expected.totalMinorUnits === null,
                    )!;
                return textMessage(
                  JSON.stringify(fixtureExtractionJson(fixture)),
                );
              }),
            },
          },
        },
      ),
    "ClaudeReceiptExtractor",
  );

  it("maps a valid model response into ReceiptExtractionResult", async () => {
    const client: ClaudeMessagesClient = {
      messages: {
        create: vi.fn(async () =>
          textMessage(JSON.stringify(fixtureExtractionJson(amazonFixture))),
        ),
      },
    };

    const extractor = makeClaudeReceiptExtractor(
      { apiKey: "test-key", model: "claude-test", maxConcurrency: 1 },
      { client },
    );

    const result = await extractor.extract(amazonFixture.input);

    expect(result.source).toBe("llm");
    expect(result.merchantName.toLowerCase()).toContain("amazon");
    expect(result.totalAmount?.minorUnits).toBe(4599);
    expect(result.orderId).toBe("123-4567890");
  });

  it("rejects invented totals after schema parse", async () => {
    const client: ClaudeMessagesClient = {
      messages: {
        create: vi.fn(async () =>
          textMessage(
            JSON.stringify({
              ...fixtureExtractionJson(amazonFixture),
              totalAmount: "99.99",
            }),
          ),
        ),
      },
    };

    const extractor = makeClaudeReceiptExtractor(
      { apiKey: "test-key", model: "claude-test", maxConcurrency: 1 },
      { client },
    );

    await expect(extractor.extract(amazonFixture.input)).rejects.toThrow(
      ValidationError,
    );
    expect(client.messages.create).toHaveBeenCalledTimes(2);
  });

  it("parses each fixture email when the model returns matching JSON", async () => {
    for (const fixture of RECEIPT_EMAIL_FIXTURES) {
      const client: ClaudeMessagesClient = {
        messages: {
          create: vi.fn(async () =>
            textMessage(JSON.stringify(fixtureExtractionJson(fixture))),
          ),
        },
      };

      const extractor = makeClaudeReceiptExtractor(
        { apiKey: "test-key", model: "claude-test", maxConcurrency: 1 },
        { client },
      );

      const result = await extractor.extract(fixture.input);

      expect(result.merchantName.toLowerCase()).toContain(
        fixture.expected.merchantNameContains,
      );
      if (fixture.expected.totalMinorUnits === null) {
        expect(result.totalAmount).toBeNull();
      } else {
        expect(result.totalAmount?.minorUnits).toBe(
          fixture.expected.totalMinorUnits,
        );
      }
      expect(result.orderId).toBe(fixture.expected.orderId);
    }
  });

  it("fixture catalog covers core receipt kinds", () => {
    expect(RECEIPT_EMAIL_FIXTURES.length).toBeGreaterThanOrEqual(15);

    const kinds = new Set(RECEIPT_EMAIL_FIXTURES.map((fixture) => fixture.input.kind));
    for (const kind of FIXTURE_KINDS) {
      expect(kinds.has(kind)).toBe(true);
    }
  });
});
