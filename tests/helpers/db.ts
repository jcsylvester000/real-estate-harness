import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { setDbOverride, schema, type DB } from "@/lib/db/client";

/** Fresh in-memory Postgres with all migrations, wired into every store. */
export async function freshDb(): Promise<DB> {
  const client = new PGlite();
  const db = drizzle({ client, schema }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: `${process.cwd()}/drizzle` });
  setDbOverride(db);
  return db;
}
