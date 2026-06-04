import { describe, it, expect } from "vitest";
import { InvariantError, UpstreamError } from "@expense/core";
import { mapPlaidError } from "./errors.js";

describe("mapPlaidError", () => {
  it("maps rate limits to UpstreamError", () => {
    const err = mapPlaidError({
      response: { data: { error_code: "RATE_LIMIT_EXCEEDED" } },
    });
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.retryable).toBe(true);
  });

  it("maps item login required to InvariantError", () => {
    const err = mapPlaidError({
      response: { data: { error_code: "ITEM_LOGIN_REQUIRED" } },
    });
    expect(err).toBeInstanceOf(InvariantError);
    expect(err.retryable).toBe(false);
  });

  it("wraps unknown failures as UpstreamError", () => {
    expect(mapPlaidError(new Error("network"))).toBeInstanceOf(UpstreamError);
  });
});
