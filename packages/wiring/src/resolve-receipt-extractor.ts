import type { ReceiptExtractor } from "@expense/core";
import { makeFakeReceiptExtractor } from "@expense/core/testing";
import type { AppConfig, Env } from "@expense/config";
import {
  hasAnthropicCredentials,
  makeClaudeReceiptExtractor,
} from "@expense/llm";
import type { WorkerWiringOptions } from "./types.js";

export function resolveReceiptExtractor(
  env: Env,
  app: AppConfig,
  opts: WorkerWiringOptions,
): ReceiptExtractor {
  if (opts.receiptExtractor) return opts.receiptExtractor;
  if (env.LLM_FAKE) return makeFakeReceiptExtractor();
  if (hasAnthropicCredentials(env)) {
    return makeClaudeReceiptExtractor({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.LLM_MODEL,
      maxConcurrency: app.llm.maxConcurrency,
    });
  }
  return makeFakeReceiptExtractor();
}
