import { describe, it, expect } from "vitest";
import { ValidationError } from "@expense/core";
import { newId } from "@expense/core";
import { toBullJobId } from "./job-id.js";
import { validateJobPayload } from "./jobs.js";

describe("toBullJobId", () => {
  it("replaces colons so BullMQ accepts logical ids", () => {
    const userId = newId<"UserId">();
    expect(toBullJobId(`digest:${userId}:2026-W21`)).toBe(
      `digest/${userId}/2026-W21`,
    );
    expect(toBullJobId(`txn.sync:${userId}`)).toBe(`txn.sync/${userId}`);
  });
});

describe("validateJobPayload", () => {
  it("accepts a valid baseline.recompute payload", () => {
    const userId = newId<"UserId">();
    const result = validateJobPayload("baseline.recompute", { userId });
    expect(result.userId).toBe(userId);
  });

  it("rejects a malformed payload", () => {
    expect(() =>
      validateJobPayload("digest.generate", { userId: newId() }),
    ).toThrow(ValidationError);
  });
});
