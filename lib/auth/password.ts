/**
 * Password rules and hashing.
 * AU-02: 15 to 128 characters, any characters (spaces allowed), no composition rules.
 * AU-03: refuse common/breached passwords and passwords containing the username; say why.
 * AU-04: Argon2id, at least m=19 MiB, t=2, p=1; parameters stored in the hash string.
 */
import { hash, verify } from "@node-rs/argon2";
import { COMMON_LONG_PASSWORDS } from "./data/common-passwords";

export const PASSWORD_MIN = 15;
export const PASSWORD_MAX = 128;

export const ARGON2_OPTIONS = {
  algorithm: 2, // Algorithm.Argon2id (const enum value; isolatedModules cannot import it)
  memoryCost: 19456, // KiB = 19 MiB (OWASP minimum)
  timeCost: 2,
  parallelism: 1,
} as const;

const common = new Set(COMMON_LONG_PASSWORDS);

/** True if the text is one short unit repeated (e.g. "passwordpassword", "abcabcabcabcabc", "aaaaaaaaaaaaaaa"). */
function isRepeatedUnit(s: string) {
  for (let n = 1; n <= Math.floor(s.length / 2); n++) {
    if (s.length % n === 0 && s.slice(0, n).repeat(s.length / n) === s) return true;
  }
  return false;
}

/** True for straight runs such as "123456789012345" or "abcdefghijklmnop". */
function isSequence(s: string) {
  if (s.length < 8) return false;
  let up = 0;
  let down = 0;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d === 1 || (s[i - 1] === "9" && s[i] === "0")) up++;
    if (d === -1 || (s[i - 1] === "0" && s[i] === "9")) down++;
  }
  return up >= s.length - 2 || down >= s.length - 2;
}

export type PasswordCheck = { ok: true } | { ok: false; reason: string };

export function checkPassword(password: string, username?: string): PasswordCheck {
  if ([...password].length < PASSWORD_MIN)
    return { ok: false, reason: `Use at least ${PASSWORD_MIN} characters. A phrase of a few words is fine.` };
  if ([...password].length > PASSWORD_MAX) return { ok: false, reason: `Use ${PASSWORD_MAX} characters or fewer.` };
  const compact = password.toLowerCase().replace(/\s+/g, "");
  if (common.has(password.toLowerCase()) || common.has(compact) || isRepeatedUnit(compact) || isSequence(compact))
    return { ok: false, reason: "That password is too common or easy to guess. Try a phrase of a few unrelated words." };
  if (username && username.length >= 3 && compact.includes(username.toLowerCase()))
    return { ok: false, reason: "Your password must not contain your username." };
  return { ok: true };
}

export function hashPassword(password: string) {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(stored: string, password: string) {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** A valid hash of a random value, used to keep timing similar when a username does not exist. */
let dummy: Promise<string> | null = null;
export function dummyHash() {
  dummy ??= hash("grid-dummy-password-" + Math.random(), ARGON2_OPTIONS);
  return dummy;
}
