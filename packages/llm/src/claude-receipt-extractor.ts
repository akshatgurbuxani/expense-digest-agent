import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import Anthropic from "@anthropic-ai/sdk";
import {
  Money,
  ValidationError,
  type ReceiptExtractionInput,
  type ReceiptExtractionResult,
  type ReceiptExtractor,
} from "@expense/core";
import { parseModelJson } from "./claude-json.js";
import { makeConcurrencyLimiter, type ConcurrencyLimiter } from "./concurrency.js";
import {
  type ClaudeMessagesClient,
  hasAnthropicCredentials,
} from "./claude-llm-provider.js";
import { mapAnthropicError, withLlmParseRetry } from "./errors.js";
import {
  buildReceiptExtractionPrompt,
  ReceiptExtractionResponseSchema,
  receiptBodyText,
} from "./prompts/receipt.js";
import { assertAmountsPresentInSource } from "./receipt-amount-validate.js";

export interface ClaudeReceiptExtractorConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly maxConcurrency: number;
}

export interface ClaudeReceiptExtractorDeps {
  readonly client?: ClaudeMessagesClient;
  readonly limiter?: ConcurrencyLimiter;
}

export function makeClaudeReceiptExtractor(
  cfg: ClaudeReceiptExtractorConfig,
  deps: ClaudeReceiptExtractorDeps = {},
): ReceiptExtractor {
  const client: ClaudeMessagesClient =
    deps.client ??
    (new Anthropic({ apiKey: cfg.apiKey }) as unknown as ClaudeMessagesClient);
  const limiter =
    deps.limiter ?? makeConcurrencyLimiter(cfg.maxConcurrency);

  return {
    extract: (input) =>
      limiter.run(() =>
        withLlmParseRetry(() => extractReceipt(client, cfg.model, input)),
      ),
  };
}

async function extractReceipt(
  client: ClaudeMessagesClient,
  model: string,
  input: ReceiptExtractionInput,
): Promise<ReceiptExtractionResult> {
  try {
    const bodyText = receiptBodyText(input);
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${buildReceiptExtractionPrompt({
            kind: input.kind,
            fromAddress: input.fromAddress,
            subject: input.subject,
            bodyText,
            receivedAt: input.receivedAt,
          })}\n\nRespond with JSON only.`,
        },
      ],
    });
    return mapReceiptResponse(message, input);
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw mapAnthropicError(err);
  }
}

function mapReceiptResponse(
  message: Message,
  input: ReceiptExtractionInput,
): ReceiptExtractionResult {
  const parsed = parseModelJson(
    message,
    ReceiptExtractionResponseSchema,
    "receipt extraction",
  );

  const currency = parsed.currency ?? "USD";
  const totalAmount = parsed.totalAmount
    ? Money.fromDecimalString(parsed.totalAmount, currency)
    : null;
  const lineItems = parsed.lineItems.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    amount: item.amount
      ? Money.fromDecimalString(item.amount, currency)
      : null,
  }));

  assertAmountsPresentInSource(input, [
    totalAmount,
    ...lineItems.map((item) => item.amount),
  ]);

  return {
    merchantName: parsed.merchantName,
    merchantDomain: parsed.merchantDomain,
    orderId: parsed.orderId,
    orderUrl: parsed.orderUrl,
    totalAmount,
    occurredAt: parseOccurredAt(parsed.occurredAt),
    lineItems,
    confidence: parsed.confidence,
    source: "llm",
  };
}

function parseOccurredAt(value: string | null): Date | null {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) {
    throw new ValidationError(`invalid occurredAt in receipt extraction: ${value}`);
  }
  return at;
}

export { hasAnthropicCredentials };
