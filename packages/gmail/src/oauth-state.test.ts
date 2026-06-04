import { describe, it, expect } from "vitest";
import { newId } from "@expense/core";
import { signOAuthState, verifyOAuthState } from "./oauth-state.js";

describe("OAuth state", () => {
  it("signs and verifies user id", async () => {
    const userId = newId<"UserId">();
    const secret = "test-secret-min-16-chars";
    const state = await signOAuthState({ userId }, secret);
    await expect(verifyOAuthState(state, secret)).resolves.toEqual({ userId });
  });

  it("round-trips returnTo", async () => {
    const userId = newId<"UserId">();
    const secret = "test-secret-min-16-chars";
    const state = await signOAuthState(
      { userId, returnTo: "http://localhost:5173" },
      secret,
    );
    await expect(verifyOAuthState(state, secret)).resolves.toEqual({
      userId,
      returnTo: "http://localhost:5173",
    });
  });
});
