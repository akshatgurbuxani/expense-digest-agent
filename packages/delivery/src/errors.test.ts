import { describe, it, expect } from "vitest";
import { InvariantError, UpstreamError } from "@expense/core";
import { mapResendError, mapTwilioError } from "./errors.js";

describe("mapResendError", () => {
  it("maps validation failures to InvariantError", () => {
    expect(mapResendError({ status: 422 })).toBeInstanceOf(InvariantError);
  });

  it("maps rate limits to UpstreamError", () => {
    expect(mapResendError({ status: 429 })).toBeInstanceOf(UpstreamError);
  });

  it("maps server errors to UpstreamError", () => {
    expect(mapResendError({ status: 503 })).toBeInstanceOf(UpstreamError);
  });
});

describe("mapTwilioError", () => {
  it("maps invalid recipient codes to InvariantError", () => {
    expect(mapTwilioError({ code: 21211 })).toBeInstanceOf(InvariantError);
  });

  it("maps rate limits to UpstreamError", () => {
    expect(mapTwilioError({ code: 20429 })).toBeInstanceOf(UpstreamError);
  });

  it("maps server errors to UpstreamError", () => {
    expect(mapTwilioError({ status: 500 })).toBeInstanceOf(UpstreamError);
  });
});
