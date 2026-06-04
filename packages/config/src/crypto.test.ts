import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { makeCrypto } from "./crypto.js";
import { InvariantError } from "@expense/core";

const key = randomBytes(32).toString("base64");

describe("crypto", () => {
  it("round-trips encrypt then decrypt", () => {
    const c = makeCrypto(key);
    const secret = "access-sandbox-7f3a9c";
    expect(c.decrypt(c.encrypt(secret))).toBe(secret);
  });

  it("produces different ciphertext each call (random IV)", () => {
    const c = makeCrypto(key);
    expect(c.encrypt("same")).not.toBe(c.encrypt("same"));
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => makeCrypto("c2hvcnQ=")).toThrow(InvariantError); // "short"
  });

  it("throws InvariantError on tampered ciphertext", () => {
    const c = makeCrypto(key);
    const buf = Buffer.from(c.encrypt("secret"), "base64");
    const last = buf.length - 1;
    buf[last] = (buf[last] ?? 0) ^ 0xff; // flip a byte of the ciphertext
    expect(() => c.decrypt(buf.toString("base64"))).toThrow(InvariantError);
  });

  it("throws InvariantError when decrypting with the wrong key", () => {
    const ct = makeCrypto(key).encrypt("secret");
    const other = makeCrypto(randomBytes(32).toString("base64"));
    expect(() => other.decrypt(ct)).toThrow(InvariantError);
  });
});
