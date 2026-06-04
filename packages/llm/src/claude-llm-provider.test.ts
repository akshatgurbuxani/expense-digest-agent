import { describe, it, expect, vi } from "vitest";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { ValidationError } from "@expense/core";
import { makeClaudeLlm, type ClaudeMessagesClient } from "./claude-llm-provider.js";
import { makeConcurrencyLimiter } from "./concurrency.js";
import { withLlmParseRetry } from "./errors.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const validCategorizeJson = JSON.stringify({
  merchantName: "Whole Foods Market",
  category: "groceries",
  signals: {
    isSubscription: false,
    isRecurring: false,
    confidence: 0.92,
  },
});

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

describe("makeClaudeLlm (mocked)", () => {
  it("serializes calls through the concurrency limiter", async () => {
    const limiter = makeConcurrencyLimiter(1);
    let active = 0;
    let maxActive = 0;

    const client: ClaudeMessagesClient = {
      messages: {
        create: vi.fn(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await sleep(25);
          active -= 1;
          return textMessage(validCategorizeJson);
        }),
      },
    };

    const llm = makeClaudeLlm(
      { apiKey: "test-key", model: "claude-test", maxConcurrency: 1 },
      { client, limiter },
    );

    await Promise.all([
      llm.categorizeMerchant({
        rawName: "WHOLEFDS",
        plaidPfc: null,
        amountHint: "$10.00",
      }),
      llm.categorizeMerchant({
        rawName: "WHOLEFDS 2",
        plaidPfc: null,
        amountHint: "$12.00",
      }),
    ]);

    expect(maxActive).toBe(1);
    expect(client.messages.create).toHaveBeenCalledTimes(2);
  });

  it("retries once when the model response fails validation", async () => {
    const client: ClaudeMessagesClient = {
      messages: {
        create: vi
          .fn()
          .mockResolvedValueOnce(textMessage("{}"))
          .mockResolvedValueOnce(textMessage(validCategorizeJson)),
      },
    };

    const llm = makeClaudeLlm(
      { apiKey: "test-key", model: "claude-test", maxConcurrency: 1 },
      { client },
    );

    const result = await llm.categorizeMerchant({
      rawName: "WHOLEFDS",
      plaidPfc: null,
      amountHint: "$10.00",
    });

    expect(result.category).toBe("groceries");
    expect(client.messages.create).toHaveBeenCalledTimes(2);
  });

  it("throws ValidationError when validation fails twice", async () => {
    const client: ClaudeMessagesClient = {
      messages: {
        create: vi.fn().mockResolvedValue(textMessage('{"category":"snacks"}')),
      },
    };

    const llm = makeClaudeLlm(
      { apiKey: "test-key", model: "claude-test", maxConcurrency: 1 },
      { client },
    );

    await expect(
      llm.categorizeMerchant({
        rawName: "WHOLEFDS",
        plaidPfc: null,
        amountHint: "$10.00",
      }),
    ).rejects.toThrow(ValidationError);
    expect(client.messages.create).toHaveBeenCalledTimes(2);
  });
});

describe("withLlmParseRetry", () => {
  it("retries only once on ValidationError", async () => {
    let calls = 0;
    await expect(
      withLlmParseRetry(async () => {
        calls += 1;
        throw new ValidationError("bad llm json");
      }),
    ).rejects.toThrow(ValidationError);
    expect(calls).toBe(2);
  });
});
