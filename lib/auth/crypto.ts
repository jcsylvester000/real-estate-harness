/** Small crypto helpers: hashing tokens, salted hashing of addresses, and sealing short-lived flash data. */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** APP_SECRET (32+ characters) protects address hashes and flash cookies. */
export function appSecret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("Missing environment variable APP_SECRET (at least 32 characters)");
  return s;
}

/** Salted, keyed hash (HMAC-SHA256) for usernames and network addresses in auth_attempts (AU-11). */
export const keyedHash = (purpose: string, value: string) =>
  createHmac("sha256", appSecret()).update(`${purpose}:${value}`).digest("hex");

function flashKey() {
  return Buffer.from(hkdfSync("sha256", appSecret(), "grid-flash-salt", "grid-flash-v1", 32));
}

/** AES-256-GCM: returns base64url(iv | tag | ciphertext). */
export function seal(data: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", flashKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal<T>(token: string | undefined): T | null {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", flashKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Encrypts a secret at rest (AI keys) with its own derived key: base64url(iv | tag | ciphertext). */
const secretKey = () => Buffer.from(hkdfSync("sha256", appSecret(), "grid-secrets-salt", "grid-ai-keys-v1", 32));
export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}
export function decryptSecret(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url");
    const d = createDecipheriv("aes-256-gcm", secretKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
