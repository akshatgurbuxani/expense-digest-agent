export function claudeIntegrationEnabled(): boolean {
  return (
    Boolean(process.env.ANTHROPIC_API_KEY) && process.env.LLM_FAKE !== "true"
  );
}

export function claudeTestConfig() {
  return {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: process.env.LLM_MODEL ?? "claude-3-5-sonnet-latest",
    maxConcurrency: 2,
  };
}
