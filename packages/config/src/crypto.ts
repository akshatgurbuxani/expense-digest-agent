import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { type Crypto, InvariantError } from "@expense/core";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * AES-256-GCM implementation of the Crypto port. The stored blob is
 * base64(iv ‖ authTag ‖ ciphertext). Tampering fails the GCM auth check on
 * decrypt and raises InvariantError rather than returning garbage.
 */
export function makeCrypto(keyBase64: string): Crypto {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new InvariantError(
      `ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}`,
    );
  }

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(IV_LEN);
      const cipher = createCipheriv(ALGO, key, iv);
      const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([iv, tag, enc]).toString("base64");
    },

    decrypt(ciphertext: string): string {
      const raw = Buffer.from(ciphertext, "base64");
      if (raw.length < IV_LEN + TAG_LEN) {
        throw new InvariantError("ciphertext is too short to be valid");
      }
      const iv = raw.subarray(0, IV_LEN);
      const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
      const enc = raw.subarray(IV_LEN + TAG_LEN);
      const decipher = createDecipheriv(ALGO, key, iv);
      decipher.setAuthTag(tag);
      try {
        return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
          "utf8",
        );
      } catch (err) {
        throw new InvariantError(
          "decryption failed: ciphertext tampered or wrong key",
          err,
        );
      }
    },
  };
}
