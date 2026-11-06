/**
 * Public User IDs and recovery keys.
 * AU-06: User ID = "U-" + 6 characters from the Crockford base-32 alphabet (no I, L, O, U).
 * AU-05: recovery key = 20 random characters (same alphabet), shown as five groups of four.
 */
import { randomInt } from "node:crypto";

export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomString(length: number) {
  let s = "";
  for (let i = 0; i < length; i++) s += CROCKFORD[randomInt(CROCKFORD.length)];
  return s;
}

export const generatePublicId = () => `U-${randomString(6)}`;
export const PUBLIC_ID_PATTERN = /^U-[0-9A-HJKMNP-TV-Z]{6}$/;

export const generateRecoveryKey = () => randomString(20);

/** "ABCD-EFGH-..." for display. */
export const formatRecoveryKey = (key: string) => key.match(/.{1,4}/g)!.join("-");

/** Accepts what people type: lower case, spaces or dashes, and Crockford look-alikes (O→0, I/L→1). */
export function normalizeRecoveryKey(input: string) {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

/** Admin-issued one-time reset code: 12 characters, shown in groups of four. */
export const generateResetCode = () => randomString(12);
