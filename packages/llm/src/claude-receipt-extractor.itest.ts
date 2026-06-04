import { describe, it, expect } from "vitest";
import { makeClaudeReceiptExtractor } from "./claude-receipt-extractor.js";
import { claudeIntegrationEnabled, claudeTestConfig } from "./testing/helpers.js";
import { RECEIPT_EMAIL_FIXTURES } from "./testing/receipt-fixtures.js";

describe.skipIf(!claudeIntegrationEnabled())(
  "ClaudeReceiptExtractor (live API)",
  () => {
    const extractor = makeClaudeReceiptExtractor(claudeTestConfig());

    for (const fixture of RECEIPT_EMAIL_FIXTURES) {
      it(`extracts ${fixture.name}`, async () => {
        const result = await extractor.extract(fixture.input);

        expect(result.source).toBe("llm");
        expect(result.merchantName.toLowerCase()).toContain(
          fixture.expected.merchantNameContains,
        );
        expect(result.confidence).toBeGreaterThan(0);

        if (fixture.expected.totalMinorUnits === null) {
          expect(result.totalAmount).toBeNull();
        } else {
          expect(result.totalAmount?.minorUnits).toBe(
            fixture.expected.totalMinorUnits,
          );
        }

        if (fixture.expected.orderId) {
          expect(result.orderId).toBe(fixture.expected.orderId);
        }
      });
    }
  },
);
