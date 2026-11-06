/**
 * PIN unlock (replaces per-person sign-in for now). One shared team account; the PIN comes from
 * GRID_ACCESS_PIN (default 4120). Guessing is limited: 5 wrong PINs from one network address lock it
 * out for 15 minutes; attempts are stored as keyed hashes, never as addresses.
 */
import { timingSafeEqual } from "node:crypto";
import { and, count, eq, gte, lt } from "drizzle-orm";
import { keyedHash, randomToken } from "@/lib/auth/crypto";
import { getDb } from "@/lib/db/client";
import { accessAttempts } from "@/lib/db/schema";
import { audit } from "./audit";
import { createSession, ensureUser, type PublicUser } from "./auth";

export const TEAM_USERNAME = "grid-team";
export const PIN_LIMITS = { maxFailures: 5, windowMs: 15 * 60 * 1000 };

const pin = () => (process.env.GRID_ACCESS_PIN ?? "4120").trim();

function pinMatches(input: string) {
  const a = Buffer.from(input.padEnd(16, "\0").slice(0, 16));
  const b = Buffer.from(pin().padEnd(16, "\0").slice(0, 16));
  return timingSafeEqual(a, b) && input.length === pin().length;
}

/** The shared account every PIN unlock signs in as. Created on first use with an unusable random password. */
async function teamUser(): Promise<PublicUser> {
  const db = await getDb();
  return ensureUser(db, { username: TEAM_USERNAME, password: `${randomToken(24)}-team-account`, role: "admin", displayName: "GRID Team" });
}

export type UnlockResult = { ok: true; token: string } | { ok: false; reason: string; locked?: boolean };

export async function unlockWithPin(input: string, address: string, userAgent?: string): Promise<UnlockResult> {
  const db = await getDb();
  const who = keyedHash("pin", address);
  const since = new Date(Date.now() - PIN_LIMITS.windowMs);
  await db.delete(accessAttempts).where(lt(accessAttempts.createdAt, new Date(Date.now() - 24 * 3600_000)));
  const [{ n }] = (await db
    .select({ n: count() })
    .from(accessAttempts)
    .where(and(eq(accessAttempts.addressHash, who), eq(accessAttempts.ok, false), gte(accessAttempts.createdAt, since)))) as [{ n: number }];
  if (n >= PIN_LIMITS.maxFailures) return { ok: false, locked: true, reason: "Too many wrong PINs. Try again in 15 minutes." };

  const clean = String(input ?? "").replace(/\D/g, "").slice(0, 12);
  if (!clean || !pinMatches(clean)) {
    await db.insert(accessAttempts).values({ addressHash: who, ok: false });
    const left = PIN_LIMITS.maxFailures - n - 1;
    if (left <= 0) await audit(null, "pin.locked", {});
    return { ok: false, locked: left <= 0, reason: left <= 0 ? "Too many wrong PINs. Try again in 15 minutes." : `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left.` };
  }
  await db.insert(accessAttempts).values({ addressHash: who, ok: true });
  const user = await teamUser();
  const token = await createSession(user.id, userAgent);
  await audit(user.id, "pin.unlock", {});
  return { ok: true, token };
}
