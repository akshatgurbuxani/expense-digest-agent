import { describe, it, expect } from "vitest";
import { deepMerge } from "./merge.js";

describe("deepMerge", () => {
  it("merges nested objects without mutating the base", () => {
    const base = { a: 1, workers: { concurrency: { "txn.sync": 1 } } };
    const merged = deepMerge(base, { workers: { concurrency: { "txn.sync": 2 } } });
    expect(merged.workers.concurrency["txn.sync"]).toBe(2);
    expect(base.workers.concurrency["txn.sync"]).toBe(1);
  });

  it("replaces scalar values", () => {
    expect(deepMerge({ tick: 60_000 }, { tick: 1000 })).toEqual({ tick: 1000 });
  });
});
