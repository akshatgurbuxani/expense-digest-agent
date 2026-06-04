import { InvariantError } from "./errors.js";

/**
 * A keyed map for a family of things selected at runtime (job handlers,
 * delivery channels, anomaly detectors, ...). Dispatch is one indexed read.
 * No silent overwrite, no silent miss. See docs/patterns/registries-and-dispatch.md.
 */
export class Registry<K extends string, V> {
  private readonly map = new Map<K, V>();

  register(key: K, value: V): this {
    if (this.map.has(key)) {
      throw new InvariantError(`duplicate registry key: ${key}`);
    }
    this.map.set(key, value);
    return this;
  }

  get(key: K): V {
    const value = this.map.get(key);
    if (value === undefined) {
      throw new InvariantError(`unknown registry key: ${key}`);
    }
    return value;
  }

  tryGet(key: K): V | undefined {
    return this.map.get(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  keys(): K[] {
    return [...this.map.keys()];
  }

  values(): V[] {
    return [...this.map.values()];
  }
}
