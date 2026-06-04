import { z } from "zod";
import { ValidationError } from "@expense/core";

/** Accepts a real boolean or the strings "true"/"false"; defaults to false. */
const boolFromString = z
  .union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
  .default(false);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_PRETTY: boolFromString,
  SERVICE_NAME: z.string().optional(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  API_PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z.string().default(""),
  AUTH_JWT_SECRET: z.string().min(16),

  // Empty in local dev; if present, must be base64 of exactly 32 bytes.
  ENCRYPTION_KEY: z
    .string()
    .default("")
    .refine(
      (v) => v === "" || Buffer.from(v, "base64").length === 32,
      "ENCRYPTION_KEY must be empty or the base64 encoding of 32 bytes",
    ),

  PLAID_CLIENT_ID: z.string().default(""),
  PLAID_SECRET: z.string().default(""),
  PLAID_ENV: z
    .enum(["sandbox", "development", "production"])
    .default("sandbox"),

  ANTHROPIC_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default("claude-3-5-sonnet-latest"),
  LLM_FAKE: boolFromString,

  RESEND_API_KEY: z.string().default(""),
  DIGEST_FROM_EMAIL: z.string().default("digests@example.com"),

  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_FROM_NUMBER: z.string().default(""),

  DELIVERY_DRY_RUN: boolFromString,

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().default(""),
  GMAIL_PUBSUB_TOPIC: z.string().default(""),
  GMAIL_PUBSUB_PUSH_AUDIENCE: z.string().default(""),
});

export type Env = z.infer<typeof EnvSchema>;

/** Validate a raw key/value map (e.g. process.env) into a typed Env. */
export function makeEnv(raw: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      "invalid environment configuration",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
}

export function loadEnv(): Env {
  return makeEnv(process.env);
}
