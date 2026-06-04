import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Adapter packages and vendor SDKs that `packages/core` must never import.
// This lint rule enforces the dependency arrow from the architecture:
// core depends on nothing; adapters depend on core.
const FORBIDDEN_IN_CORE = [
  "@expense/db",
  "@expense/queue",
  "@expense/plaid",
  "@expense/llm",
  "@expense/delivery",
  "@expense/config",
  "@prisma/client",
  "bullmq",
  "ioredis",
  "plaid",
  "@anthropic-ai/sdk",
  "resend",
  "twilio",
  "express",
];

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/*.tsbuildinfo"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: FORBIDDEN_IN_CORE.map((name) => ({
            name,
            message:
              "packages/core must not import adapters or vendor SDKs (see docs/README.md dependency rule).",
          })),
          patterns: ["@prisma/*", "@anthropic-ai/*"],
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
