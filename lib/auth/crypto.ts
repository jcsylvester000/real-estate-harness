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
