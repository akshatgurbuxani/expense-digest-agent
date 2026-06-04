import { describe, it, expect } from "vitest";
import { renderAnomalySms } from "./anomaly.text.js";

describe("renderAnomalySms", () => {
  it("passes detail through without modification", () => {
    const detail = "Netflix jumped to $19.99 — up 25% from your baseline.";
    expect(renderAnomalySms(detail)).toBe(
      `Expense Digest Alert\n\n${detail}`,
    );
  });
});
