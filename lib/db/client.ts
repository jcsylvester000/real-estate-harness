/**
 * Database client.
 *  - Default: Neon pooled connection over WebSockets (DATABASE_URL).
 *  - DB_DRIVER=pglite: embedded Postgres (PGLITE_DIR or memory), migrated on first use; for local tests
 *    and offline demos only. PGLITE_SEED_ADMIN="username:password" seeds an admin.
 * Listings live in their own database: lib/listings/db.ts.
 * Created on first use, never at import, so builds work without DATABASE_URL.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export type DB = NeonDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

declare global {
  var __gaDb: Promise<DB> | undefined;
  var __gaReadDb: Promise<DB> | undefined;
  var __gaDbOverride: DB | undefined;
}

/** CQRS: the driver gate runs query methods inside runAs("read"), so getDb() picks the read replica for them. */
const mode = new AsyncLocalStorage<"read" | "write">();
export const runAs = <T>(m: "read" | "write", fn: () => Promise<T>) => mode.run(m, fn);

async function createPglite(): Promise<DB> {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PGLITE !== "true")
    throw new Error("DB_DRIVER=pglite is for local tests only");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(process.env.PGLITE_DIR || undefined);
  const instance = drizzle({ client, schema }) as unknown as DB;
  await migrate(instance as never, { migrationsFolder: `${process.cwd()}/drizzle` });
  const seed = process.env.PGLITE_SEED_ADMIN;
  if (seed) {
    const [username, ...rest] = seed.split(":");
    const { ensureUser } = await import("@/lib/server/services/auth");
    await ensureUser(instance, { username: username!, password: rest.join(":"), role: "admin", displayName: "Admin" });
  }
  return instance;
}

function createNeon(url: string | undefined): DB {
  if (!url) throw new Error("Missing environment variable DATABASE_URL");
  if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: url, max: 5 });
  return drizzleNeon({ client: pool, schema });
}

/**
 * "write" (default) for commands; "read" for queries — a Neon read replica when DATABASE_READ_URL is set,
 * otherwise the same database. Without an argument the mode comes from the driver gate (runAs).
 */
export async function getDb(m?: "read" | "write"): Promise<DB> {
  if (globalThis.__gaDbOverride) return globalThis.__gaDbOverride;
  if (!globalThis.__gaDb) {
    globalThis.__gaDb = process.env.DB_DRIVER === "pglite" ? createPglite() : Promise.resolve().then(() => createNeon(process.env.DATABASE_URL));
    globalThis.__gaDb.catch(() => (globalThis.__gaDb = undefined));
  }
  const want = m ?? mode.getStore() ?? "write";
  const readUrl = process.env.DATABASE_READ_URL;
  if (want === "write" || !readUrl || process.env.DB_DRIVER === "pglite") return globalThis.__gaDb;
  if (!globalThis.__gaReadDb) {
    globalThis.__gaReadDb = Promise.resolve().then(() => createNeon(readUrl));
    globalThis.__gaReadDb.catch(() => (globalThis.__gaReadDb = undefined));
  }
  return globalThis.__gaReadDb;
}

/** Tests: point every store at another database (PGlite). */
export function setDbOverride(instance: DB | undefined) {
  globalThis.__gaDbOverride = instance;
}

export function isUniqueViolation(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export { schema };
