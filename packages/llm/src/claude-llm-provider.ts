import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { DigestFacts, LlmProvider, MerchantEnrichment } from "@expense/core";
import type { MonthlyReportFacts } from "@expense/core";
import { ValidationError } from "@expense/core";
import { parseModelJson } from "./claude-json.js";
import { makeConcurrencyLimiter, type ConcurrencyLimiter } from "./concurrency.js";
import {
  mapAnthropicError,
  withLlmParseRetry,
} from "./errors.js";
import {
  buildCategorizePrompt,
  CategorizeResponseSchema,
} from "./prompts/categorize.js";
import { buildDigestPrompt, DigestResponseSchema } from "./prompts/digest.js";
import {
  buildMonthlyReportPrompt,
  MonthlyReportResponseSchema,
} from "./prompts/monthly-report.js";

export interface ClaudeLlmConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly maxConcurrency: number;
}

/** Minimal client surface for tests — only `messages.create`. */
export interface ClaudeMessagesClient {
  messages: {
    create(
      params: Parameters<Anthropic["messages"]["create"]>[0],
    ): Promise<Message>;
  };
}

export interface ClaudeLlmDeps {
  readonly client?: ClaudeMessagesClient;
  readonly limiter?: ConcurrencyLimiter;
}

export function makeClaudeLlm(
  cfg: ClaudeLlmConfig,
  deps: ClaudeLlmDeps = {},
): LlmProvider {
  const client: ClaudeMessagesClient =
    deps.client ??
    (new Anthropic({ apiKey: cfg.apiKey }) as unknown as ClaudeMessagesClient);
  const limiter =
    deps.limiter ?? makeConcurrencyLimiter(cfg.maxConcurrency);

  return {
    categorizeMerchant: (input) =>
      limiter.run(() =>
        withLlmParseRetry(() => categorizeMerchant(client, cfg.model, input)),
      ),

    writeDigest: (facts) =>
      limiter.run(() =>
        withLlmParseRetry(() => writeDigest(client, cfg.model, facts)),
      ),

    writeMonthlyReport: (facts) =>
      limiter.run(() =>
        withLlmParseRetry(() => writeMonthlyReport(client, cfg.model, facts)),
      ),
  };
}

async function categorizeMerchant(
  client: ClaudeMessagesClient,
  model: string,
  input: {
    rawName: string;
    plaidPfc: string | null;
    amountHint: string;
  },
): Promise<MerchantEnrichment> {
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `${buildCategorizePrompt(input)}\n\nRespond with JSON only.`,
        },
      ],
    });
    return parseModelJson(message, CategorizeResponseSchema, "categorization");
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw mapAnthropicError(err);
  }
}

async function writeDigest(
  client: ClaudeMessagesClient,
  model: string,
  facts: DigestFacts,
): Promise<{ subject: string; body: string }> {
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `${buildDigestPrompt(facts)}\n\nRespond with JSON only.`,
        },
      ],
    });
    return parseModelJson(message, DigestResponseSchema, "digest");
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw mapAnthropicError(err);
  }
}

async function writeMonthlyReport(
  client: ClaudeMessagesClient,
  model: string,
  facts: MonthlyReportFacts,
): Promise<{ subject: string; body: string }> {
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `${buildMonthlyReportPrompt(facts)}\n\nRespond with JSON only.`,
        },
      ],
    });
    return parseModelJson(message, MonthlyReportResponseSchema, "monthly report");
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw mapAnthropicError(err);
  }
}

/** True when a real Anthropic key is configured. */
export function hasAnthropicCredentials(env: {
  ANTHROPIC_API_KEY: string;
}): boolean {
  return env.ANTHROPIC_API_KEY.length > 0;
}
