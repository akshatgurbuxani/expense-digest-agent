import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { ValidationError } from "@expense/core";
import { parseAppConfig } from "./app-config.js";
import { loadAppConfigFromFiles, resolveConfigDir } from "./load-config.js";
import { makeTestConfig } from "./testing/index.js";

const repoConfigDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../config",
);

describe("app-config", () => {
  it("rejects empty input — no code defaults", () => {
    expect(() => parseAppConfig({})).toThrow(ValidationError);
  });

  it("rejects unknown top-level keys", () => {
    expect(() => parseAppConfig({ unknown: true })).toThrow(ValidationError);
  });

  it("rejects partial config missing required sections", () => {
    expect(() =>
      parseAppConfig({
        queue: { prefix: "x", maxAttempts: 3, backoff: { type: "fixed", delayMs: 1 } },
      }),
    ).toThrow(ValidationError);
  });

  it("loads default.yaml from the repo config directory", () => {
    const app = loadAppConfigFromFiles({
      configDir: repoConfigDir,
      nodeEnv: "development",
    });
    expect(app.queue.prefix).toBe("expense");
    expect(app.workers.concurrency["txn.categorize"]).toBe(1);
  });

  it("applies production overrides on top of default.yaml", () => {
    const app = loadAppConfigFromFiles({
      configDir: repoConfigDir,
      nodeEnv: "production",
    });
    expect(app.workers.concurrency["txn.categorize"]).toBe(4);
    expect(app.llm.maxConcurrency).toBe(5);
  });

  it("resolveConfigDir finds repo config when pointed explicitly", () => {
    expect(resolveConfigDir(repoConfigDir)).toBe(repoConfigDir);
  });

  it("makeTestConfig supplies test env defaults without a .env file", () => {
    const config = makeTestConfig({ configDir: repoConfigDir });
    expect(config.env.DATABASE_URL).toContain("postgresql://");
    expect(config.env.REDIS_URL).toContain("redis://");
    expect(config.env.AUTH_JWT_SECRET).toBeTruthy();
    expect(config.app.mail.fullSyncBackfillDays).toBeGreaterThan(0);
  });
});
