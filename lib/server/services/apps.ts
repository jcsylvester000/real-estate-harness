/**
 * App registry and permission grants. Built-in apps come from code; third-party apps are installed by an
 * admin with a URL and the permissions they may ask for. Each user grants those permissions per app.
 */
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { APP_ID_PATTERN, BUILTIN_APPS, builtinApp, type AppInfo } from "@/lib/apps/catalog";
import { GRANTABLE, type Permission, type Role } from "@/lib/apps/permissions";
import { getDb, isUniqueViolation } from "@/lib/db/client";
import { appGrants, apps } from "@/lib/db/schema";
import { invalid, notFound } from "../errors";
import { audit } from "./audit";

const toApp = (r: typeof apps.$inferSelect): AppInfo => ({
  id: r.id,
  name: r.name,
  description: r.description,
  icon: r.icon,
  url: r.url,
  kind: "external",
  permissions: (r.permissions ?? []).filter((p): p is Permission => (GRANTABLE as string[]).includes(p)),
  width: r.width,
  height: r.height,
});

/** Apps this user may see and open (built-ins filtered by role, then enabled third-party apps). */
export async function listApps(role: Role): Promise<AppInfo[]> {
  const db = await getDb();
  const rows = await db.select().from(apps).where(eq(apps.enabled, true)).orderBy(asc(apps.name)).limit(200);
  return [...BUILTIN_APPS.filter((a) => !a.roles || a.roles.includes(role)), ...rows.map(toApp)];
}

/** Resolves an app id to its definition, or null when unknown or disabled. */
export async function resolveApp(appId: string): Promise<AppInfo | null> {
  const b = builtinApp(appId);
  if (b) return b;
  if (!APP_ID_PATTERN.test(appId)) return null;
  const db = await getDb();
  const [r] = await db.select().from(apps).where(and(eq(apps.id, appId), eq(apps.enabled, true)));
  return r ? toApp(r) : null;
}

/** Third-party URLs: https anywhere, or a same-site path (e.g. /sample-apps/...). http only for localhost. */
export function checkAppUrl(url: string) {
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) return u.toString();
  } catch {
    /* fall through */
  }
  throw invalid("App URL must be https:// (or a /path on this site).");
}

export const installInput = z.object({
  id: z.string().regex(APP_ID_PATTERN, "App id: 2-40 lower-case letters, numbers or dashes"),
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(200).default(""),
  icon: z.string().trim().max(20).default("app"),
  url: z.string().trim().min(1).max(500),
  permissions: z.array(z.enum(GRANTABLE as [Permission, ...Permission[]])).max(GRANTABLE.length).default([]),
  width: z.coerce.number().int().min(320).max(1600).default(720),
  height: z.coerce.number().int().min(240).max(1200).default(520),
});

export async function installApp(actorId: string, input: z.infer<typeof installInput>) {
  if (builtinApp(input.id)) throw invalid("That id belongs to a built-in app.");
  const db = await getDb();
  try {
    const [r] = await db.insert(apps).values({ ...input, url: checkAppUrl(input.url), createdBy: actorId }).returning();
    await audit(actorId, "apps.install", { app: input.id, permissions: input.permissions }, db);
    return toApp(r!);
  } catch (err) {
    if (isUniqueViolation(err)) throw invalid("An app with that id is already installed.");
    throw err;
  }
}

export async function uninstallApp(actorId: string, appId: string) {
  const db = await getDb();
  const rows = await db.delete(apps).where(eq(apps.id, appId)).returning({ id: apps.id });
  if (!rows.length) throw notFound("App");
  await db.delete(appGrants).where(eq(appGrants.appId, appId));
  await audit(actorId, "apps.uninstall", { app: appId }, db);
  return true;
}

export async function grantsFor(userId: string, appId?: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(appGrants)
    .where(appId ? and(eq(appGrants.userId, userId), eq(appGrants.appId, appId)) : eq(appGrants.userId, userId))
    .limit(1000);
  return rows.map((r) => ({ appId: r.appId, permission: r.permission as Permission, createdAt: r.createdAt.toISOString() }));
}

export async function hasGrant(userId: string, appId: string, permission: Permission) {
  const db = await getDb();
  const [r] = await db
    .select({ p: appGrants.permission })
    .from(appGrants)
    .where(and(eq(appGrants.userId, userId), eq(appGrants.appId, appId), eq(appGrants.permission, permission)));
  return !!r;
}

/** Records a user's "Allow" from the desktop permission dialog. Only declared, grantable permissions. */
export async function grant(userId: string, appId: string, permission: Permission) {
  const app = await resolveApp(appId);
  if (!app || app.kind !== "external") throw notFound("App");
  if (!GRANTABLE.includes(permission) || !app.permissions.includes(permission)) throw invalid("This app did not declare that permission.");
  const db = await getDb();
  await db.insert(appGrants).values({ userId, appId, permission }).onConflictDoNothing();
  await audit(userId, "apps.grant", { app: appId, permission }, db);
  return true;
}

export async function revoke(userId: string, appId: string, permission?: Permission) {
  const db = await getDb();
  const where = [eq(appGrants.userId, userId), eq(appGrants.appId, appId)];
  if (permission) where.push(eq(appGrants.permission, permission));
  await db.delete(appGrants).where(and(...where));
  await audit(userId, "apps.revoke", { app: appId, permission: permission ?? "all" }, db);
  return true;
}
