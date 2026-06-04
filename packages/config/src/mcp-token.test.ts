import { describe, it, expect } from "vitest";
import { newId } from "@expense/core";
import { ValidationError } from "@expense/core";
import { FixedClock } from "@expense/core/testing";
import { makeMcpTokenService } from "./mcp-token.js";

const SECRET = "test-mcp-secret-at-least-32-chars!!";

describe("makeMcpTokenService", () => {
  const clock = new FixedClock(new Date("2026-05-25T12:00:00.000Z"));
  const tokens = makeMcpTokenService({ secret: SECRET, clock });

  it("mints a token that verifies back to the same userId", async () => {
    const userId = newId<"UserId">();
    const token = await tokens.mint(userId);
    const verified = await tokens.verify(token);
    expect(verified).toBe(userId);
  });

  it("rejects tokens signed with a different secret", async () => {
    const userId = newId<"UserId">();
    const token = await tokens.mint(userId);
    const other = makeMcpTokenService({
      secret: "other-secret-at-least-32-chars-long",
      clock,
    });
    await expect(other.verify(token)).rejects.toThrow(ValidationError);
  });

  it("rejects expired tokens", async () => {
    const userId = newId<"UserId">();
    const token = await tokens.mint(userId, { ttlSeconds: 1 });
    clock.advance(2_000);
    await expect(tokens.verify(token)).rejects.toThrow(ValidationError);
  });
});
