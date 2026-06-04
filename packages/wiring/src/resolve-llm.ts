import type { LlmProvider } from "@expense/core";
import type { AppConfig, Env } from "@expense/config";
import { hasAnthropicCredentials, makeClaudeLlm, makeFakeLlm } from "@expense/llm";
import type { WorkerWiringOptions } from "./types.js";

export function resolveLlm(
  env: Env,
  app: AppConfig,
  opts: WorkerWiringOptions,
): LlmProvider {
  if (opts.llm) return opts.llm;
  if (env.LLM_FAKE) return makeFakeLlm();
  if (hasAnthropicCredentials(env)) {
    return makeClaudeLlm({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.LLM_MODEL,
      maxConcurrency: app.llm.maxConcurrency,
    });
  }
  return makeFakeLlm();
}
