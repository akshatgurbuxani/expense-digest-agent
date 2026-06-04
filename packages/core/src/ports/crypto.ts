/**
 * Authenticated symmetric encryption for secrets at rest (e.g. Plaid access
 * tokens). `decrypt` throws on tamper/auth failure — a corrupt secret is never
 * silently treated as empty.
 */
export interface Crypto {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}
