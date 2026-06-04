import { loadAppConfigFromFiles } from "../load-config.js";
import { loadConfig } from "../load-config.js";
import type { AppConfig } from "../app-config.js";
import { makeEnv, type Env } from "../env.js";
import type { Config } from "../load-config.js";

/** Minimal env for tests and local dev with in-memory adapters. */
export function makeTestEnv(
  overrides: Record<string, string | undefined> = {},
): Env {
  return makeEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "error",
    DATABASE_URL:
      "postgresql://expense:expense@localhost:5433/expense?schema=public",
    REDIS_URL: "redis://localhost:6379",
    AUTH_JWT_SECRET: "test-secret-min-16-chars",
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    LLM_FAKE: "true",
    DELIVERY_DRY_RUN: "true",
    ...overrides,
  });
}

/** Load app tunables from config/default.yaml + config/test.yaml — same pipeline as production. */
export function makeTestAppConfig(configDir?: string): AppConfig {
  return loadAppConfigFromFiles({ configDir, nodeEnv: "test" });
}

/** Full config bundle for tests. */
export function makeTestConfig(
  opts: {
    env?: Record<string, string | undefined>;
    configDir?: string;
    appOverrides?: Record<string, unknown>;
  } = {},
): Config {
  const testEnv = makeTestEnv(opts.env);
  return loadConfig({
    env: { ...testEnv, ...opts.env, NODE_ENV: "test" } as unknown as Record<
      string,
      string | undefined
    >,
    configDir: opts.configDir,
    appOverrides: opts.appOverrides,
  });
}
