import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

/** The listings database (separate schema, optionally a separate Neon database). */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/listings/schema.ts",
  out: "./drizzle-listings",
  schemaFilter: ["listings_index"],
  dbCredentials: { url: process.env.LISTINGS_DATABASE_URL_UNPOOLED || process.env.LISTINGS_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "" },
  migrations: { schema: "listings_index" },
  strict: true,
});
