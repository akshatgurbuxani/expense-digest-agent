import { describe, it, expect } from "vitest";
import { newId } from "@expense/core";
import { ValidationError } from "@expense/core";
import { FixedClock } from "@expense/core/testing";
import { makeAuthTokenService } from "./auth-token.js";

const SECRET = "test-auth-secret-min-16-chars";

describe("makeAuthTokenService", () => {
  const clock = new FixedClock(new Date("2026-05-25T12:00:00.000Z"));
  const tokens = makeAuthTokenService({ secret: SECRET, clock });

  it("mints a token that verifies back to the same userId", async () => {
    const userId = newId<"UserId">();
    const token = await tokens.mint(userId);
    await expect(tokens.verify(token)).resolves.toBe(userId);
  });

  it("rejects tokens signed with a different secret", async () => {
    const userId = newId<"UserId">();
    const token = await tokens.mint(userId);
    const other = makeAuthTokenService({
      secret: "other-auth-secret-min-16-ch",
      clock,
    });
    await expect(other.verify(token)).rejects.toThrow(ValidationError);
  });
});
