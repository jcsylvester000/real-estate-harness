/** Listings inventory: the only properties the AI may recommend (harness search_listings reads from here). */
import { and, asc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import demo from "@/lib/harness/sample-listings.json";
import type { Listing } from "@/lib/harness/tools/search-listings";
import { getDb, type DB } from "@/lib/db/client";
import { listings } from "@/lib/db/schema";

type Row = typeof listings.$inferSelect;

export const PROPERTY_TYPES = ["condominium", "house_and_lot", "lot", "commercial"] as const;
export const STATUSES = ["available", "pre_selling", "for_lease", "reserved", "sold"] as const;

export const listingInput = z.object({
  id: z.string().regex(/^[A-Z0-9-]{3,24}$/, "ID: 3-24 capital letters, numbers or dashes").optional(),
  title: z.string().trim().min(3).max(140),
  city: z.string().trim().min(2).max(60),
  area: z.string().trim().max(80).default(""),
  propertyType: z.enum(PROPERTY_TYPES),
  bedrooms: z.coerce.number().int().min(0).max(50).default(0),
  bathrooms: z.coerce.number().int().min(0).max(50).default(0),
  floorAreaSqm: z.coerce.number().min(0).max(1_000_000).nullable().default(null),
  lotAreaSqm: z.coerce.number().min(0).max(100_000_000).nullable().default(null),
  price: z.coerce.number().positive().max(100_000_000_000),
  status: z.enum(STATUSES).default("available"),
  titleType: z.string().trim().max(40).default(""),
  foreignEligible: z.coerce.boolean().default(false),
  notes: z.string().trim().max(2000).default(""),
});
export type ListingInput = z.infer<typeof listingInput>;

export const toListing = (r: Row): Listing & { isDemo: boolean; updatedAt: string } => ({
  id: r.id,
  title: r.title,
  city: r.city,
  area: r.area,
  propertyType: r.propertyType as Listing["propertyType"],
  bedrooms: r.bedrooms,
  bathrooms: r.bathrooms,
  floorAreaSqm: r.floorAreaSqm === null ? null : Number(r.floorAreaSqm),
  lotAreaSqm: r.lotAreaSqm === null ? null : Number(r.lotAreaSqm),
  price: Number(r.pricePhp),
  status: r.status as Listing["status"],
  titleType: r.titleType,
  foreignEligible: r.foreignEligible,
  notes: r.notes,
  isDemo: r.isDemo,
  updatedAt: r.updatedAt.toISOString(),
});

export interface ListingFilter {
  q?: string;
  city?: string;
  propertyType?: string;
  status?: string[];
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  foreignEligibleOnly?: boolean;
  limit?: number;
  offset?: number;
}

export async function searchListingRows(f: ListingFilter) {
  const db = await getDb();
  const where: SQL[] = [];
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    where.push(or(ilike(listings.title, like), ilike(listings.city, like), ilike(listings.area, like), ilike(listings.id, like))!);
  }
  if (f.city) {
    const like = `%${f.city.replace(/[%_]/g, "")}%`;
    where.push(or(ilike(listings.city, like), ilike(listings.area, like))!);
  }
  if (f.propertyType) where.push(eq(listings.propertyType, f.propertyType));
  if (f.status?.length) where.push(inArray(listings.status, f.status));
  if (f.minPrice !== undefined) where.push(gte(listings.pricePhp, String(f.minPrice)));
  if (f.maxPrice !== undefined) where.push(lte(listings.pricePhp, String(f.maxPrice)));
  if (f.minBedrooms !== undefined) where.push(gte(listings.bedrooms, f.minBedrooms));
  if (f.foreignEligibleOnly) where.push(eq(listings.foreignEligible, true));
  const rows = await db
    .select()
    .from(listings)
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(listings.pricePhp))
    .limit(Math.min(f.limit ?? 50, 200))
    .offset(f.offset ?? 0);
  return rows.map(toListing);
}

/**
 * Loader for the harness search_listings tool. Pre-filters in SQL by the same fields the tool filters on,
 * so the tool never loads the whole inventory.
 */
export async function harnessListingLoader(input: Record<string, unknown>): Promise<Listing[]> {
  return searchListingRows({
    city: typeof input.city === "string" ? input.city : undefined,
    propertyType: typeof input.propertyType === "string" ? input.propertyType : undefined,
    status: input.forLease ? ["for_lease"] : ["available", "pre_selling"],
    minPrice: typeof input.minPrice === "number" ? input.minPrice : undefined,
    maxPrice: typeof input.maxPrice === "number" ? input.maxPrice : undefined,
    minBedrooms: typeof input.minBedrooms === "number" ? input.minBedrooms : undefined,
    foreignEligibleOnly: input.foreignEligibleOnly === true,
    limit: 200,
  });
}

export async function getListing(id: string) {
  const db = await getDb();
  const [r] = await db.select().from(listings).where(eq(listings.id, id));
  return r ? toListing(r) : null;
}

async function nextId(db: DB) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(listings);
  return `GRID-${String((row?.n ?? 0) + 1).padStart(4, "0")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

export async function saveListing(input: ListingInput, userId: string) {
  const db = await getDb();
  const values = {
    title: input.title,
    city: input.city,
    area: input.area,
    propertyType: input.propertyType,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    floorAreaSqm: input.floorAreaSqm === null ? null : String(input.floorAreaSqm),
    lotAreaSqm: input.lotAreaSqm === null ? null : String(input.lotAreaSqm),
    pricePhp: input.price.toFixed(2),
    status: input.status,
    titleType: input.titleType,
    foreignEligible: input.foreignEligible,
    notes: input.notes,
    isDemo: false,
    updatedAt: new Date(),
  };
  const id = input.id ?? (await nextId(db));
  const [row] = await db
    .insert(listings)
    .values({ id, ...values, createdBy: userId })
    .onConflictDoUpdate({ target: listings.id, set: values })
    .returning();
  return toListing(row!);
}

export async function deleteListing(id: string) {
  const db = await getDb();
  const rows = await db.delete(listings).where(eq(listings.id, id)).returning({ id: listings.id });
  return rows.length > 0;
}

/** Loads the harness demo inventory (fictitious) once. Safe to run repeatedly. */
export async function seedDemoListings(db?: DB) {
  const d = db ?? (await getDb());
  const rows = (demo as Listing[]).map((l) => ({
    id: l.id,
    title: l.title,
    city: l.city,
    area: l.area,
    propertyType: l.propertyType,
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    floorAreaSqm: l.floorAreaSqm === null ? null : String(l.floorAreaSqm),
    lotAreaSqm: l.lotAreaSqm === null ? null : String(l.lotAreaSqm),
    pricePhp: l.price.toFixed(2),
    status: l.status,
    titleType: l.titleType,
    foreignEligible: l.foreignEligible,
    notes: l.notes,
    isDemo: true,
  }));
  if (rows.length) await d.insert(listings).values(rows).onConflictDoNothing();
  return rows.length;
}
