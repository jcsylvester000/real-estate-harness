/**
 * The listings database: a separate Postgres schema ("listings_index") with its own migrations
 * (drizzle-listings/). It can live in the app database or in its own Neon database (LISTINGS_DATABASE_URL).
 *
 * Search index, built by Postgres on every write:
 *  - search      tsvector, weighted A name · B place · C property kind · D notes  (GIN)  → ranked keyword search
 *  - search_text accent-free name + place                                         (GIN trigram) → typo-tolerant match
 *  - btree on (transaction_type, property_type, price_php), city, province, availability → fast filters and facets
 * The *_norm columns are written by the importer (lib/listings/normalize.ts) so "Parañaque" and "Paranaque" match.
 */
import { sql } from "drizzle-orm";
import { boolean, customType, index, integer, jsonb, numeric, pgSchema, serial, text, timestamp } from "drizzle-orm/pg-core";

export const listingsSchema = pgSchema("listings_index");

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const listings = listingsSchema.table(
  "listings",
  {
    /** GRID listing code (e.g. GRID_6637409546), or GRID-M-… for listings added in the app. */
    code: text("code").primaryKey(),
    /** grid_export | manual | demo */
    source: text("source").notNull(),
    name: text("name").notNull(),
    notes: text("notes").notNull().default(""),
    /** available | inactive | reserved | sold */
    availability: text("availability").notNull().default("available"),
    /** sale | lease */
    transactionType: text("transaction_type").notNull(),
    /** residential | commercial | land | industrial | agricultural | other */
    propertyType: text("property_type").notNull(),
    /** condominium-unit, house-and-lot, residential-lot, ... (empty when the source did not say) */
    propertySubType: text("property_sub_type").notNull().default(""),
    /** The sub-type, or one inferred from the name when the source left it blank (see kindInferred). Used for filters. */
    kind: text("kind").notNull().default(""),
    kindInferred: boolean("kind_inferred").notNull().default(false),
    /** Sale price, or monthly rent for leases, in pesos. */
    pricePhp: numeric("price_php", { precision: 16, scale: 2 }).notNull(),
    location: text("location").notNull().default(""),
    city: text("city"),
    province: text("province"),
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    floorAreaSqm: numeric("floor_area_sqm", { precision: 12, scale: 2 }),
    lotAreaSqm: numeric("lot_area_sqm", { precision: 14, scale: 2 }),
    foreignEligible: boolean("foreign_eligible"),
    titleType: text("title_type").notNull().default(""),
    listedBy: text("listed_by").notNull().default(""),
    /** broker | re_salesperson */
    listedByType: text("listed_by_type").notNull().default(""),
    /** Internal contact only: never sent to the AI or to third-party apps. */
    listedByEmail: text("listed_by_email").notNull().default(""),
    gridVerification: text("grid_verification").notNull().default(""),
    exclusive: boolean("exclusive").notNull().default(false),
    sourceCreatedAt: ts("source_created_at"),
    sourcePublishedAt: ts("source_published_at"),
    sourceUpdatedAt: ts("source_updated_at"),
    importBatchId: integer("import_batch_id"),
    nameNorm: text("name_norm").notNull().default(""),
    placeNorm: text("place_norm").notNull().default(""),
    kindNorm: text("kind_norm").notNull().default(""),
    notesNorm: text("notes_norm").notNull().default(""),
    searchText: text("search_text").notNull().default(""),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(name_norm, '')), 'A') || setweight(to_tsvector('simple', coalesce(place_norm, '')), 'B') || setweight(to_tsvector('simple', coalesce(kind_norm, '')), 'C') || setweight(to_tsvector('simple', coalesce(notes_norm, '')), 'D')`,
    ),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("listings_search_idx").using("gin", t.search),
    index("listings_search_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
    index("listings_filter_idx").on(t.transactionType, t.propertyType, t.pricePhp),
    index("listings_kind_idx").on(t.kind, t.pricePhp),
    index("listings_city_idx").on(t.city),
    index("listings_province_idx").on(t.province),
    index("listings_availability_idx").on(t.availability),
    index("listings_source_idx").on(t.source),
  ],
);

export const importBatches = listingsSchema.table("import_batches", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  source: text("source").notNull(),
  rowsTotal: integer("rows_total").notNull().default(0),
  inserted: integer("inserted").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  /** First 50 row problems: { row, code, reason }. */
  problems: jsonb("problems").$type<{ row: number; code: string; reason: string }[]>().notNull().default([]),
  /** App user id (no foreign key: this database may be separate from the app database). */
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
});
