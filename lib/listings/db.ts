/**
 * Connection to the listings database.
 *  - LISTINGS_DATABASE_URL: a separate Neon database for listings (optional).
 *  - otherwise DATABASE_URL: the same Neon database as the app, in its own "listings_index" schema.
 *  - DB_DRIVER=pglite: a separate embedded Postgres (LISTINGS_PGLITE_DIR or memory) for tests and offline demos.
 * Created on first use, so builds work without any database.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export type ListingsDB = NeonDatabase<typeof schema>;

declare global {
  var __gaListingsDb: Promise<ListingsDB> | undefined;
  var __gaListingsReadDb: Promise<ListingsDB> | undefined;
  var __gaListingsDbOverride: ListingsDB | undefined;
}

export const LISTINGS_MIGRATIONS = "drizzle-listings";

async function createPglite(): Promise<ListingsDB> {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PGLITE !== "true")
    throw new Error("DB_DRIVER=pglite is for local tests only");
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite({ dataDir: process.env.LISTINGS_PGLITE_DIR || undefined, extensions: { pg_trgm } });
  const db = drizzle({ client, schema }) as unknown as ListingsDB;
  await migrate(db as never, { migrationsFolder: `${process.cwd()}/${LISTINGS_MIGRATIONS}`, migrationsSchema: "listings_index" });
  if (process.env.PGLITE_SEED_DEMO === "true") {
    // Seed through the write model, then build the read models (commands need this instance to exist).
    globalThis.__gaListingsDb = Promise.resolve(db);
    const { seedDemoListings } = await import("./import");
    await seedDemoListings();
  }
  return db;
}

function createNeon(url: string | undefined): ListingsDB {
  if (!url) throw new Error("Missing environment variable DATABASE_URL (or LISTINGS_DATABASE_URL)");
  if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;
  return drizzleNeon({ client: new Pool({ connectionString: url, max: 5 }), schema });
}

const writeUrl = () => process.env.LISTINGS_DATABASE_URL || process.env.DATABASE_URL;
/** Read replica for queries (CQRS read side). Falls back to the write database. */
const readUrl = () => process.env.LISTINGS_DATABASE_READ_URL || process.env.DATABASE_READ_URL || writeUrl();

/** "write" for commands and projections, "read" for queries. Same database unless a read URL is set. */
export async function getListingsDb(mode: "read" | "write" = "write"): Promise<ListingsDB> {
  if (globalThis.__gaListingsDbOverride) return globalThis.__gaListingsDbOverride;
  if (!globalThis.__gaListingsDb) {
    globalThis.__gaListingsDb = process.env.DB_DRIVER === "pglite" ? createPglite() : Promise.resolve().then(() => createNeon(writeUrl()));
    globalThis.__gaListingsDb.catch(() => (globalThis.__gaListingsDb = undefined));
  }
  if (mode === "write" || process.env.DB_DRIVER === "pglite" || readUrl() === writeUrl()) return globalThis.__gaListingsDb;
  if (!globalThis.__gaListingsReadDb) {
    globalThis.__gaListingsReadDb = Promise.resolve().then(() => createNeon(readUrl()));
    globalThis.__gaListingsReadDb.catch(() => (globalThis.__gaListingsReadDb = undefined));
  }
  return globalThis.__gaListingsReadDb;
}

export function setListingsDbOverride(db: ListingsDB | undefined) {
  globalThis.__gaListingsDbOverride = db;
}

export { schema as listingsSchemaModule };
