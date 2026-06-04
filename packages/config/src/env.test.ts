import { describe, it, expect } from "vitest";
import { makeEnv } from "./env.js";
import { ValidationError } from "@expense/core";

const base = {
  DATABASE_URL: "postgresql://x",
  REDIS_URL: "redis://x",
  AUTH_JWT_SECRET: "0123456789abcdef",
};

describe("env", () => {
  it("parses a valid environment and applies defaults", () => {
    const env = makeEnv({ ...base });
    expect(env.NODE_ENV).toBe("development");
    expect(env.API_PORT).toBe(3000);
    expect(env.LLM_FAKE).toBe(false);
    expect(env.PLAID_ENV).toBe("sandbox");
  });

  it("coerces numbers and booleans from strings", () => {
    const env = makeEnv({
      ...base,
      API_PORT: "4000",
      LLM_FAKE: "true",
      DELIVERY_DRY_RUN: "true",
    });
    expect(env.API_PORT).toBe(4000);
    expect(env.LLM_FAKE).toBe(true);
    expect(env.DELIVERY_DRY_RUN).toBe(true);
  });

  it("throws ValidationError when a required var is missing", () => {
    expect(() =>
      makeEnv({ REDIS_URL: "redis://x", AUTH_JWT_SECRET: "0123456789abcdef" }),
    ).toThrow(ValidationError);
  });

  it("rejects a too-short AUTH_JWT_SECRET", () => {
    expect(() => makeEnv({ ...base, AUTH_JWT_SECRET: "short" })).toThrow(
      ValidationError,
    );
  });

  it("rejects an ENCRYPTION_KEY that is not 32 bytes", () => {
    // base64("tooshort") = 8 bytes
    expect(() => makeEnv({ ...base, ENCRYPTION_KEY: "dG9vc2hvcnQ=" })).toThrow(
      ValidationError,
    );
  });

  it("accepts an empty ENCRYPTION_KEY (local dev)", () => {
    expect(makeEnv({ ...base, ENCRYPTION_KEY: "" }).ENCRYPTION_KEY).toBe("");
  });
});
