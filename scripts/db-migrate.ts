/**
 * Applies migrations to both databases. Safe to run repeatedly. Usage: npm run db:migrate
 *  - App database (DATABASE_URL_UNPOOLED, else DATABASE_URL): ./drizzle
 *  - Listings database (LISTINGS_DATABASE_URL[_UNPOOLED], else the app database): ./drizzle-listings, schema listings_index
 */
import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { pgOptions, isPlainPostgres } from "../lib/db/driver";

config({ path: ".env.local" });

async function run(label: string, url: string, folder: string, schema?: string) {
  // Plain PostgreSQL (DigitalOcean, RDS, a VPS or Docker) uses node-postgres; Neon its serverless driver.
  if (isPlainPostgres(url)) {
    const pg = new PgPool(pgOptions(url, 1));
    try {
      const started = Date.now();
      await migratePg(drizzlePg({ client: pg }), { migrationsFolder: folder, ...(schema ? { migrationsSchema: schema } : {}) });
      console.log(`db:migrate ${label} done in ${Date.now() - started} ms (PostgreSQL).`);
    } finally {
      await pg.end();
    }
    return;
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const started = Date.now();
    await migrate(drizzle({ client: pool }), { migrationsFolder: folder, ...(schema ? { migrationsSchema: schema } : {}) });
    console.log(`db:migrate ${label} done in ${Date.now() - started} ms.`);
  } finally {
    await pool.end();
  }
}

async function main() {
  const app = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const listings = process.env.LISTINGS_DATABASE_URL_UNPOOLED || process.env.LISTINGS_DATABASE_URL || app;
  if (!app) {
    console.log("db:migrate skipped: DATABASE_URL_UNPOOLED and DATABASE_URL are not set.");
    return;
  }
  if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;
  await run("app database", app, "./drizzle");
  await run(listings === app ? "listings index (same database, schema listings_index)" : "listings database", listings!, "./drizzle-listings", "listings_index");
}

main().catch((err) => {
  console.error("db:migrate failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
