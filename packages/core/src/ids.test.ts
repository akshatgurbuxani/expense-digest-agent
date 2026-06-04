import { describe, it, expect } from "vitest";
import { newId, type UserId } from "./ids.js";

describe("ids", () => {
  it("generates unique ids", () => {
    const a = newId<"UserId">();
    const b = newId<"UserId">();
    expect(a).not.toBe(b);
  });

  it("generates time-sortable ids (uuidv7)", async () => {
    const first = newId<"UserId">();
    await new Promise((r) => setTimeout(r, 3));
    const second = newId<"UserId">();
    expect(second > first).toBe(true);
  });

  it("looks like a v7 uuid", () => {
    expect(newId<"UserId">()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("is assignable to a branded id type", () => {
    const id: UserId = newId<"UserId">();
    expect(typeof id).toBe("string");
  });
});
