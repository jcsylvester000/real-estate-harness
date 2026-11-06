/**
 * The listings database: a separate Postgres schema ("listings_index") with its own migrations
 * (drizzle-listings/). It can live in the app database or its own Neon database (LISTINGS_DATABASE_URL),
 * and reads can go to a Neon read replica (LISTINGS_DATABASE_READ_URL).
 *
 * CQRS layout
 *  WRITE MODEL (commands only): listings, buyer_profiles, import_batches
 *  EVENT LOG   (append-only):   events — every command appends what happened; projectors read it
 *  READ MODELS (queries only):  listing_search  denormalized cards + search index + match features
 *                               listing_stats   facets and market medians (one row per key)
 *                               match_results   precomputed buyer↔listing scores (two-way matching)
 *  projection_state records how far each projector has read the event log.
 */
import { sql } from "drizzle-orm";
import { bigserial, boolean, customType, index, integer, jsonb, numeric, pgSchema, primaryKey, real, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const listingsSchema = pgSchema("listings_index");

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// -- Write model --

export const listings = listingsSchema.table("listings", {
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
  /** Sub-type as the source gave it (empty when not stated). */
  propertySubType: text("property_sub_type").notNull().default(""),
  /** The sub-type, or one inferred from the name (kindInferred). */
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
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Saved buyer requirements for two-way matching. Describe needs, not people: no names, IDs or contacts. */
export const buyerProfiles = listingsSchema.table("buyer_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  notes: text("notes").notNull().default(""),
  criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull(),
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

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

// -- Event log --

export const events = listingsSchema.table(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** ListingsImported | ListingSaved | ListingDeleted | BuyerProfileSaved | BuyerProfileDeleted */
    type: text("type").notNull(),
    /** Listing codes or buyer profile ids the event touches. */
    keys: jsonb("keys").$type<string[]>().notNull().default([]),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    actor: text("actor"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("events_type_idx").on(t.type, t.id)],
);

export const projectionState = listingsSchema.table("projection_state", {
  name: text("name").primaryKey(),
  lastEventId: integer("last_event_id").notNull().default(0),
  /** Bumped on every projection run; read caches key on it. */
  version: integer("version").notNull().default(0),
  /** Projection code version: a change forces a full rebuild. */
  schemaVersion: integer("schema_version").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// -- Read models --

export const listingSearch = listingsSchema.table(
  "listing_search",
  {
    code: text("code").primaryKey(),
    source: text("source").notNull(),
    availability: text("availability").notNull(),
    transactionType: text("transaction_type").notNull(),
    propertyType: text("property_type").notNull(),
    kind: text("kind").notNull(),
    pricePhp: numeric("price_php", { precision: 16, scale: 2 }).notNull(),
    city: text("city"),
    province: text("province"),
    region: text("region"),
    locationTier: text("location_tier").notNull().default("unknown"),
    bedrooms: integer("bedrooms"),
    areaSqm: real("area_sqm"),
    pricePerSqm: real("price_per_sqm"),
    features: text("features").array().notNull().default(sql`'{}'::text[]`),
    /** 0-1: how complete the listing's data is (drives match confidence). */
    quality: real("quality").notNull().default(0),
    /** Ready-made card for the UI (no mapping on read). */
    card: jsonb("card").$type<Record<string, unknown>>().notNull(),
    /** Listing analysis for matching and the Listings app. */
    analysis: jsonb("analysis").$type<Record<string, unknown>>().notNull(),
    sortDate: ts("sort_date").notNull(),
    nameNorm: text("name_norm").notNull().default(""),
    placeNorm: text("place_norm").notNull().default(""),
    kindNorm: text("kind_norm").notNull().default(""),
    notesNorm: text("notes_norm").notNull().default(""),
    searchText: text("search_text").notNull().default(""),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(name_norm, '')), 'A') || setweight(to_tsvector('simple', coalesce(place_norm, '')), 'B') || setweight(to_tsvector('simple', coalesce(kind_norm, '')), 'C') || setweight(to_tsvector('simple', coalesce(notes_norm, '')), 'D')`,
    ),
    projectedAt: ts("projected_at").notNull().defaultNow(),
  },
  (t) => [
    index("ls_search_idx").using("gin", t.search),
    index("ls_search_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
    index("ls_features_idx").using("gin", t.features),
    index("ls_filter_idx").on(t.availability, t.transactionType, t.propertyType, t.pricePhp),
    index("ls_kind_idx").on(t.kind, t.pricePhp),
    index("ls_city_idx").on(t.city),
    index("ls_province_idx").on(t.province),
    index("ls_region_idx").on(t.region),
    index("ls_sort_idx").on(t.sortDate),
  ],
);

export const listingStats = listingsSchema.table("listing_stats", {
  key: text("key").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const matchResults = listingsSchema.table(
  "match_results",
  {
    profileId: uuid("profile_id").notNull(),
    code: text("code").notNull(),
    /** 1.0-10.0 */
    score: real("score").notNull(),
    breakdown: jsonb("breakdown").$type<unknown[]>().notNull(),
    computedAt: ts("computed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.code] }), index("mr_code_idx").on(t.code, t.score), index("mr_profile_idx").on(t.profileId, t.score)],
);
