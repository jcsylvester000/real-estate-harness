/**
 * Accounts and sessions. Staff accounts only: an admin creates users (no public sign-up).
 * - Passwords: 15-128 characters, common/breached list refused, Argon2id (lib/auth/password.ts).
 * - Sessions: random 32-byte token in an HttpOnly cookie; only its SHA-256 is stored.
 *   Idle timeout 12 h, absolute 7 days.
 * - Lockout: 5 failed sign-ins lock the account for 15 minutes.
 */
import { and, asc, count, eq, lt, sql } from "drizzle-orm";
import { checkPassword, dummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { randomToken, sha256 } from "@/lib/auth/crypto";
import { generatePublicId } from "@/lib/auth/ids";
import { ROLES, type Role } from "@/lib/apps/permissions";
import { getDb, isUniqueViolation, type DB } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { invalid, notFound } from "../errors";
import { audit } from "./audit";

export const LIMITS = {
  sessionIdleMs: 12 * 60 * 60 * 1000,
  sessionAbsoluteMs: 7 * 24 * 60 * 60 * 1000,
  maxFailedLogins: 5,
  lockMs: 15 * 60 * 1000,
};

export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

export interface PublicUser {
  id: string;
  publicId: string;
  username: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface ActiveSession {
  sessionId: string;
  user: PublicUser;
}

const toPublic = (u: typeof users.$inferSelect): PublicUser => ({
  id: u.id,
  publicId: u.publicId,
  username: u.username,
  displayName: u.displayName,
  role: (ROLES.includes(u.role as Role) ? u.role : "salesperson") as Role,
  mustChangePassword: u.mustChangePassword,
});

function validateNewUser(username: string, password: string, role: string) {
  if (!USERNAME_PATTERN.test(username)) throw invalid("Username: 3-32 letters, numbers, dots, dashes or underscores.");
  if (!ROLES.includes(role as Role)) throw invalid("Unknown role.");
  const pw = checkPassword(password, username);
  if (!pw.ok) throw invalid(pw.reason);
}

/** Creates a user. Throws invalid_input for a taken username or weak password. */
export async function createUser(
  input: { username: string; password: string; role: Role; displayName?: string; mustChangePassword?: boolean },
  db?: DB,
) {
  const d = db ?? (await getDb());
  validateNewUser(input.username, input.password, input.role);
  try {
    const [row] = await d
      .insert(users)
      .values({
        publicId: generatePublicId(),
        username: input.username,
        displayName: (input.displayName || input.username).slice(0, 80),
        passwordHash: await hashPassword(input.password),
        role: input.role,
        mustChangePassword: input.mustChangePassword ?? false,
      })
      .returning();
    return toPublic(row!);
  } catch (err) {
    if (isUniqueViolation(err)) throw invalid("That username is taken.");
    throw err;
  }
}

/** Test and seed helper: creates the user if the username is free. */
export async function ensureUser(db: DB, input: { username: string; password: string; role: Role; displayName?: string }) {
  const [existing] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${input.username})`);
  return existing ? toPublic(existing) : createUser(input, db);
}

export async function userCount() {
  const db = await getDb();
  const [row] = await db.select({ n: count() }).from(users);
  return row?.n ?? 0;
}

/** First-run setup: creates the first admin only while there are no users at all. */
export async function setupFirstAdmin(input: { username: string; password: string; displayName?: string }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7311101)`);
    const [row] = await tx.select({ n: count() }).from(users);
    if ((row?.n ?? 0) > 0) throw invalid("Setup is already done. Sign in instead.");
    const user = await createUser({ ...input, role: "admin" }, tx as unknown as DB);
    await audit(user.id, "setup.first_admin", {}, tx as unknown as DB);
    return user;
  });
}

export type LoginResult = { ok: true; token: string; user: PublicUser } | { ok: false; reason: string };

export async function login(username: string, password: string, userAgent?: string): Promise<LoginResult> {
  const db = await getDb();
  const generic = "Wrong username or password.";
  const [u] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${username})`);
  if (!u) {
    await verifyPassword(await dummyHash(), password); // keeps timing similar for unknown usernames
    return { ok: false, reason: generic };
  }
  if (u.lockedUntil && u.lockedUntil > new Date()) return { ok: false, reason: "Too many attempts. Try again in 15 minutes." };
  const good = await verifyPassword(u.passwordHash, password);
  if (!good) {
    const failed = u.failedLogins + 1;
    const lock = failed >= LIMITS.maxFailedLogins;
    await db
      .update(users)
      .set({ failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LIMITS.lockMs) : u.lockedUntil })
      .where(eq(users.id, u.id));
    await audit(u.id, lock ? "auth.locked" : "auth.failed", {}, db);
    return { ok: false, reason: lock ? "Too many attempts. Try again in 15 minutes." : generic };
  }
  if (u.disabled) return { ok: false, reason: "This account is disabled. Ask a GRID admin." };
  await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id));
  const token = await createSession(u.id, userAgent);
  await audit(u.id, "auth.login", {}, db);
  return { ok: true, token, user: toPublic(u) };
}

/** Starts a session for a user who was already verified (password or PIN). Returns the cookie token. */
export async function createSession(userId: string, userAgent?: string) {
  const db = await getDb();
  const token = randomToken();
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + LIMITS.sessionAbsoluteMs),
    userAgent: userAgent?.slice(0, 200),
  });
  return token;
}

/** Loads the session behind a cookie token, enforcing idle and absolute timeouts. */
export async function validateSession(token: string | undefined): Promise<ActiveSession | null> {
  if (!token || token.length > 100) return null;
  const db = await getDb();
  const id = sha256(token);
  const [row] = await db.select({ s: sessions, u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(eq(sessions.id, id));
  if (!row) return null;
  const now = Date.now();
  if (row.u.disabled || row.s.expiresAt.getTime() < now || row.s.lastSeenAt.getTime() + LIMITS.sessionIdleMs < now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  // Touch at most once a minute to keep writes low.
  if (now - row.s.lastSeenAt.getTime() > 60_000) await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, id));
  return { sessionId: id, user: toPublic(row.u) };
}

export async function logout(token: string | undefined) {
  if (!token) return;
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function changePassword(userId: string, current: string, next: string, keepSessionId?: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw notFound("User");
  if (!(await verifyPassword(u.passwordHash, current))) throw invalid("Your current password is not right.");
  const pw = checkPassword(next, u.username);
  if (!pw.ok) throw invalid(pw.reason);
  await db.update(users).set({ passwordHash: await hashPassword(next), mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, userId));
  // Sign out other devices.
  await db.delete(sessions).where(keepSessionId ? and(eq(sessions.userId, userId), sql`${sessions.id} <> ${keepSessionId}`) : eq(sessions.userId, userId));
  await audit(userId, "auth.password_changed", {}, db);
}

export async function listUsers() {
  const db = await getDb();
  const rows = await db.select().from(users).orderBy(asc(users.username)).limit(500);
  return rows.map((u) => ({ ...toPublic(u), disabled: u.disabled, createdAt: u.createdAt.toISOString() }));
}

export async function updateUser(actorId: string, userId: string, patch: { role?: Role; disabled?: boolean; displayName?: string }) {
  const db = await getDb();
  if (actorId === userId && (patch.disabled || (patch.role && patch.role !== "admin")))
    throw invalid("You cannot disable or demote your own account.");
  if (patch.role && !ROLES.includes(patch.role)) throw invalid("Unknown role.");
  const [row] = await db
    .update(users)
    .set({ ...patch, ...(patch.displayName ? { displayName: patch.displayName.slice(0, 80) } : {}), updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (!row) throw notFound("User");
  if (patch.disabled) await db.delete(sessions).where(eq(sessions.userId, userId));
  await audit(actorId, "users.update", { target: row.publicId, ...patch }, db);
  return toPublic(row);
}

/** Admin sets a temporary password; the user must change it at next sign-in. */
export async function adminResetPassword(actorId: string, userId: string, temporary: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw notFound("User");
  const pw = checkPassword(temporary, u.username);
  if (!pw.ok) throw invalid(pw.reason);
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(temporary), mustChangePassword: true, failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await audit(actorId, "users.reset_password", { target: u.publicId }, db);
}

export async function updateDisplayName(userId: string, displayName: string) {
  const name = displayName.trim().slice(0, 80);
  if (!name) throw invalid("Display name is required.");
  const db = await getDb();
  await db.update(users).set({ displayName: name, updatedAt: new Date() }).where(eq(users.id, userId));
}

/** Housekeeping: remove expired sessions (called opportunistically on sign-in pages). */
export async function purgeExpiredSessions() {
  const db = await getDb();
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
