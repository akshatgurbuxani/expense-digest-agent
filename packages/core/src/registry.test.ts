import { describe, it, expect } from "vitest";
import { Registry } from "./registry.js";
import { InvariantError } from "./errors.js";

describe("Registry", () => {
  it("registers and retrieves by key", () => {
    const r = new Registry<string, number>();
    r.register("a", 1);
    expect(r.get("a")).toBe(1);
  });

  it("is chainable", () => {
    const r = new Registry<string, number>().register("a", 1).register("b", 2);
    expect(r.values()).toEqual([1, 2]);
    expect(r.keys()).toEqual(["a", "b"]);
  });

  it("throws on duplicate registration (no silent overwrite)", () => {
    const r = new Registry<string, number>().register("a", 1);
    expect(() => r.register("a", 2)).toThrow(InvariantError);
  });

  it("throws on an unknown key (no silent miss)", () => {
    const r = new Registry<string, number>();
    expect(() => r.get("missing")).toThrow(InvariantError);
  });

  it("tryGet returns undefined for a missing key", () => {
    expect(new Registry<string, number>().tryGet("x")).toBeUndefined();
  });

  it("reports membership", () => {
    const r = new Registry<string, number>().register("a", 1);
    expect(r.has("a")).toBe(true);
    expect(r.has("b")).toBe(false);
  });
});
