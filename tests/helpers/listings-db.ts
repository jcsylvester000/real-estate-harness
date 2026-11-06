import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { setListingsDbOverride, listingsSchemaModule, type ListingsDB } from "@/lib/listings/db";

/** Fresh in-memory listings database (separate from the app database), wired into every listings call. */
export async function freshListingsDb(): Promise<ListingsDB> {
  const client = new PGlite({ extensions: { pg_trgm } });
  const db = drizzle({ client, schema: listingsSchemaModule }) as unknown as ListingsDB;
  await migrate(db as never, { migrationsFolder: `${process.cwd()}/drizzle-listings`, migrationsSchema: "listings_index" });
  setListingsDbOverride(db);
  return db;
}
