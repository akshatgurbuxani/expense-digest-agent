# Application configuration

Non-secret tunables live here as layered YAML. **Secrets stay in `.env` only.**

## Rules

1. **`config/default.yaml` is required** — startup fails if it is missing or incomplete.
2. **No code defaults** — Zod validates the merged YAML strictly; missing keys throw `ValidationError`.
3. **Environment overlays are optional** — `development.yaml`, `production.yaml`, `test.yaml` deep-merge on top of `default.yaml`.

## Layering

```
default.yaml  →  {NODE_ENV}.yaml (if file exists)  →  Zod parse (fail fast)
```

## Override config directory

```bash
export APP_CONFIG_DIR=/path/to/config
```

## What belongs where

| Layer | Examples |
|-------|----------|
| **`.env`** | `DATABASE_URL`, `PLAID_*`, `ANTHROPIC_API_KEY`, `AUTH_JWT_SECRET` |
| **YAML** | Worker concurrency, queue retries, scheduler tick, anomaly thresholds, LLM concurrency |

## Tests

Tests load the same YAML pipeline via `makeTestConfig()` or, for isolated unit
tests, `makeTestEnv()` + `makeTestAppConfig()` from `@expense/config`
(`default.yaml` + `test.yaml`). No silent in-code defaults.

Composition roots inject the loaded config through `@expense/wiring` resolvers.
