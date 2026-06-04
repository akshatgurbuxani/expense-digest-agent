import { describe, it, expect } from "vitest";
import {
  AppError,
  InvariantError,
  ValidationError,
  UpstreamError,
  NotFoundError,
} from "./errors.js";

describe("errors", () => {
  it("exposes stable, machine-readable codes", () => {
    expect(new InvariantError("x").code).toBe("invariant");
    expect(new ValidationError("x").code).toBe("validation");
    expect(new UpstreamError("x").code).toBe("upstream");
    expect(new NotFoundError("x").code).toBe("not_found");
  });

  it("classifies retryability so the queue can decide retry vs DLQ", () => {
    expect(new UpstreamError("x").retryable).toBe(true);
    expect(new InvariantError("x").retryable).toBe(false);
    expect(new ValidationError("x").retryable).toBe(false);
    expect(new NotFoundError("x").retryable).toBe(false);
  });

  it("preserves the underlying cause", () => {
    const root = new Error("root");
    expect(new UpstreamError("wrapped", root).cause).toBe(root);
  });

  it("carries validation issues", () => {
    const issues = [{ path: "email", message: "required" }];
    expect(new ValidationError("bad", issues).issues).toEqual(issues);
  });

  it("is both an AppError and an Error, with the concrete name", () => {
    const e = new InvariantError("x");
    expect(e).toBeInstanceOf(AppError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("InvariantError");
  });
});
