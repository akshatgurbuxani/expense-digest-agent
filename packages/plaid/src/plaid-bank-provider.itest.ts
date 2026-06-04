import { describe, it, expect } from "vitest";
import { InvariantError } from "@expense/core";
import { bankProviderContract } from "@expense/core/testing/contracts";
import { makeBankProvider, makePlaidApi } from "./plaid-bank-provider.js";
import {
  createSandboxPublicToken,
  plaidIntegrationEnabled,
  sandboxPlaidConfig,
} from "./testing/sandbox.js";

const enabled = plaidIntegrationEnabled();

describe.skipIf(!enabled)("PlaidBankProvider (sandbox)", () => {
  const cfg = sandboxPlaidConfig();
  const client = makePlaidApi(cfg);
  const bank = makeBankProvider(cfg);

  bankProviderContract(() => bank, "Plaid", {
    sandboxPublicToken: () => createSandboxPublicToken(client),
  });

  it("verifyWebhook rejects a tampered JWT", async () => {
    const body = JSON.stringify({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: "item_test",
    });

    await expect(
      bank.verifyWebhook(
        { "Plaid-Verification": "not.a.valid.jwt" },
        Buffer.from(body),
      ),
    ).rejects.toThrow(InvariantError);
  });
});
