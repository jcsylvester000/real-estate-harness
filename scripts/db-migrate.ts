/**
 * Applies the SQL migrations in ./drizzle to the database in DATABASE_URL_UNPOOLED
 * (falls back to DATABASE_URL). Safe to run repeatedly. Usage: npm run db:migrate
 */
import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.log("db:migrate skipped: DATABASE_URL_UNPOOLED and DATABASE_URL are not set.");
    return;
  }
  if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const started = Date.now();
    await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
    const { rows } = await pool.query(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
    );
    console.log(`db:migrate done in ${Date.now() - started} ms. Tables in public schema: ${rows[0].n}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("db:migrate failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
