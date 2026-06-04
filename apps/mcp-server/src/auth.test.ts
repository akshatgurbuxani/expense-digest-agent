import { describe, it, expect } from "vitest";
import { ValidationError, newId } from "@expense/core";
import { FixedClock } from "@expense/core/testing";
import { makeMcpTokenService } from "@expense/config";
import { resolveMcpUserId } from "./auth.js";

const SECRET = "test-mcp-secret-at-least-32-chars!!";

describe("resolveMcpUserId", () => {
  const clock = new FixedClock(new Date("2026-05-25T12:00:00.000Z"));
  const tokens = makeMcpTokenService({ secret: SECRET, clock });

  it("rejects missing tokens", async () => {
    await expect(
      resolveMcpUserId(tokens, undefined),
    ).rejects.toThrow(ValidationError);
  });

  it("returns the user id from a valid token", async () => {
    const userId = newId<"UserId">();
    const token = await tokens.mint(userId);
    await expect(resolveMcpUserId(tokens, token)).resolves.toBe(userId);
  });
});
