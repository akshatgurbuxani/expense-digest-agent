# YAML-Driven E2E Testing

## What We Built

A **declarative test scenario framework** using YAML configuration files. Every
e2e test loads its scenario from a `.yaml` file — data and assertions are
separate from test logic.

### Architecture

```
test-scenarios/e2e/            # YAML scenario files
    default.yaml                 multi-user full pipeline demo
    webhook-to-digest.yaml       single-user webhook → digest

packages/core/src/testing/
    e2e-scenario-schema.ts     # Zod schema for all scenario shapes
    e2e-harness.ts             # loadE2EScenario, seedFromScenario, expandScenario
    tunables.ts                # scenario tuning defaults (LOG_LEVEL, etc.)

apps/api/e2e/                  # Tests that use YAML
    webhook-to-digest.e2e.ts     reads webhook-to-digest.yaml
    scenario-runner.e2e.ts       reads default.yaml (multi-user demo)
```

---

## How It Works

### 1. Define Scenario in YAML

Scenarios support both **generative** (spending patterns define transaction
generation at test time) and **explicit** (concrete `existingTransactions` +
`mailMessages`):

```yaml
# test-scenarios/e2e/default.yaml
name: "Full Pipeline — Multi-User"
users:
  - email: "user1@example.com"
    timezone: "America/Denver"
    patterns: ["moderate"]
    existingTransactions:
      - amount: 6599
        merchantName: "Amazon"
        occurredAt: "2026-05-23T14:00:00.000Z"
    mailMessages:
      - from: "order@amazon.com"
        subject: "Your Amazon order"
        bodyName: "amazon-order-confirmation"
```

### 2. Load and Execute in Test

```typescript
import { loadE2EScenario, expandScenario } from "@expense/core/testing";

it("runs scenario from YAML", async () => {
  const gen = await loadE2EScenario("webhook-to-digest");
  const populated = expandScenario(gen);          // pattern → concrete txns
  const { users, bankMessages } = populated;
  
  const ctx = seedFromScenario(populated, repos); // seed DB
  // Run pipeline with FixedClock...
  
  assertExpectations(gen.expected, {
    digests,
    anomalies,
    deliveries,
  });
});
```

### 3. Run

```bash
# Individual e2e tests (integration suite)
npm run test:integration

# Multi-user scenario runner (verbose output)
npm run scenario
```

---

## Benefits

### ✅ **Decoupled**: Data (YAML) separate from logic (TypeScript)
- Change test data without touching code
- Non-developers can write scenarios
- Easy to version control scenario changes

### ✅ **Consistent with Production**: Same pattern as `config/*.yaml`
- `config/default.yaml` → production tunables
- `test-scenarios/e2e/*.yaml` → test scenarios
- Both use Zod validation

### ✅ **Maintainable**:
- Scenarios are self-documenting (name + description)
- Schema validation catches typos
- Spending patterns generate realistic transaction volumes without hardcoding
- Explicit receipts + existing transactions for targeted edge cases

### YAML scenario files

| File | Test | What it covers |
|------|------|----------------|
| `default.yaml` | `scenario-runner.e2e.ts` | 2 users, 5 weekly digests, receipt matching |
| `webhook-to-digest.yaml` | `webhook-to-digest.e2e.ts` | Single webhook → full pipeline |
