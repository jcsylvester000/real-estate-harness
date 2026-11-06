/**
 * Querying the listings index.
 * Keyword search runs in two passes: every word must match (ranked by ts_rank_cd over the weighted tsvector);
 * if nothing matches, any word may match, plus trigram word-similarity for typos ("makatti", "paranaque").
 * Filters use the btree indexes. Results never include contact emails; the AI shape also omits the uploader.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { ListingsDB } from "./db";
import { AVAILABILITY, KIND_IDS, KINDS, PROPERTY_TYPES, TRANSACTION_TYPES } from "./kinds";
import { normalizeText, searchWords } from "./normalize";
import { correctPlaceWords, resolvePlaceFuzzy } from "./places";
import { listings } from "./schema";

type Row = typeof listings.$inferSelect;

export const searchInput = z.object({
  query: z.string().trim().max(200).optional(),
  transactionType: z.enum(TRANSACTION_TYPES).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  kind: z.enum(KIND_IDS as [string, ...string[]]).optional(),
  /** A city, district or landmark ("BGC", "Alabang"), resolved through the gazetteer. */
  city: z.string().trim().max(80).optional(),
  province: z.string().trim().max(80).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minBedrooms: z.coerce.number().int().min(0).max(20).optional(),
  minAreaSqm: z.coerce.number().min(0).optional(),
  maxAreaSqm: z.coerce.number().min(0).optional(),
  availability: z.array(z.enum(AVAILABILITY)).max(4).optional(),
  source: z.enum(["grid_export", "manual", "demo"]).optional(),
  sort: z.enum(["relevance", "price_asc", "price_desc", "newest"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(50_000).optional(),
});
export type SearchInput = z.infer<typeof searchInput>;

export interface ListingCard {
  code: string;
  name: string;
  availability: string;
  transactionType: string;
  propertyType: string;
  kind: string;
  kindLabel: string;
  kindInferred: boolean;
  price: number;
  location: string;
  city: string | null;
  province: string | null;
  bedrooms: number | null;
  floorAreaSqm: number | null;
  lotAreaSqm: number | null;
  gridVerification: string;
  source: string;
  listedBy: string;
  listedByType: string;
  updatedAt: string;
}

const num = (v: string | null) => (v === null ? null : Number(v));
export const toCard = (r: Row): ListingCard => ({
  code: r.code,
  name: r.name,
  availability: r.availability,
  transactionType: r.transactionType,
  propertyType: r.propertyType,
  kind: r.kind,
  kindLabel: KINDS[r.kind]?.label ?? (r.kind ? r.kind.replace(/-/g, " ") : "Not stated"),
  kindInferred: r.kindInferred,
  price: Number(r.pricePhp),
  location: r.location,
  city: r.city,
  province: r.province,
  bedrooms: r.bedrooms,
  floorAreaSqm: num(r.floorAreaSqm),
  lotAreaSqm: num(r.lotAreaSqm),
  gridVerification: r.gridVerification,
  source: r.source,
  listedBy: r.listedBy,
  listedByType: r.listedByType,
  updatedAt: r.updatedAt.toISOString(),
});

/** What the AI sees: no uploader names or contacts, rent labelled as monthly. */
export const toAiListing = (c: ListingCard) => ({
  code: c.code,
  name: c.name,
  transaction: c.transactionType,
  kind: c.kindLabel + (c.kindInferred ? " (inferred from name)" : ""),
  propertyType: c.propertyType,
  [c.transactionType === "lease" ? "monthlyRentPhp" : "pricePhp"]: c.price,
  location: c.location,
  city: c.city,
  province: c.province,
  bedrooms: c.bedrooms,
  floorAreaSqm: c.floorAreaSqm,
  lotAreaSqm: c.lotAreaSqm,
  availability: c.availability,
  gridVerified: c.gridVerification === "verified",
});

export interface SearchResult {
  total: number;
  /** all: every keyword matched · partial: some keywords or a close spelling matched · none: no keywords given */
  matchMode: "all" | "partial" | "none";
  /** Plain-language notes about how the search was widened or corrected. */
  notes: string[];
  listings: ListingCard[];
  applied: Record<string, unknown>;
}

function filters(f: SearchInput, applied: Record<string, unknown>, opts: { bedroomsUnknownOk?: boolean } = {}): SQL[] {
  const w: SQL[] = [];
  const avail = f.availability?.length ? f.availability : ["available"];
  w.push(inArray(listings.availability, avail));
  applied.availability = avail;
  if (f.transactionType) w.push(eq(listings.transactionType, (applied.transactionType = f.transactionType)));
  if (f.kind) w.push(eq(listings.kind, (applied.kind = f.kind)));
  else if (f.propertyType) w.push(eq(listings.propertyType, (applied.propertyType = f.propertyType)));
  if (f.city || f.province) {
    const p = f.city ? resolvePlaceFuzzy(f.city) : { city: null, province: null };
    const prov = f.province ? (resolvePlaceFuzzy(f.province).province ?? f.province) : null;
    if (p.city) w.push(eq(listings.city, (applied.city = p.city)));
    else if (p.province || prov) w.push(eq(listings.province, (applied.province = (p.province ?? prov)!)));
    else if (f.city) {
      // Unknown place name: match it as text in the location instead.
      const like = `%${normalizeText(f.city)}%`;
      w.push(sql`${listings.placeNorm} like ${like}`);
      applied.placeText = f.city;
    }
  }
  if (f.minPrice !== undefined) w.push(gte(listings.pricePhp, String((applied.minPrice = f.minPrice))));
  if (f.maxPrice !== undefined) w.push(lte(listings.pricePhp, String((applied.maxPrice = f.maxPrice))));
  if (f.minBedrooms !== undefined) {
    applied.minBedrooms = f.minBedrooms;
    w.push(opts.bedroomsUnknownOk ? sql`(${listings.bedrooms} >= ${f.minBedrooms} or ${listings.bedrooms} is null)` : gte(listings.bedrooms, f.minBedrooms));
  }
  const area = sql`coalesce(${listings.lotAreaSqm}, ${listings.floorAreaSqm})`;
  if (f.minAreaSqm !== undefined) w.push(sql`${area} >= ${(applied.minAreaSqm = f.minAreaSqm)}`);
  if (f.maxAreaSqm !== undefined) w.push(sql`${area} <= ${(applied.maxAreaSqm = f.maxAreaSqm)}`);
  if (f.source) w.push(eq(listings.source, (applied.source = f.source)));
  return w;
}

async function run(db: ListingsDB, where: SQL[], rank: SQL, sort: SearchInput["sort"], limit: number, offset: number, knownBedroomsFirst = false) {
  const order =
    sort === "price_asc"
      ? [asc(listings.pricePhp)]
      : sort === "price_desc"
        ? [desc(listings.pricePhp)]
        : sort === "newest"
          ? [desc(sql`coalesce(${listings.sourcePublishedAt}, ${listings.sourceCreatedAt}, ${listings.createdAt})`)]
          : [desc(rank), asc(listings.pricePhp)];
  const first = knownBedroomsFirst ? [asc(sql`(${listings.bedrooms} is null)`)] : [];
  const rows = await db
    .select({ row: listings, total: sql<number>`count(*) over()`.mapWith(Number) })
    .from(listings)
    .where(and(...where))
    .orderBy(...first, ...order)
    .limit(limit)
    .offset(offset);
  return { total: rows[0]?.total ?? 0, rows: rows.map((r) => r.row) };
}

export async function searchListings(db: ListingsDB, input: SearchInput): Promise<SearchResult> {
  // Many listings (mostly houses and lots) do not state bedrooms. With a bedroom filter, listings that state
  // enough bedrooms come first, then those that do not say, so nothing suitable is hidden.
  const r = await searchOnce(db, input, { bedroomsUnknownOk: input.minBedrooms !== undefined });
  if (input.minBedrooms !== undefined && r.listings.some((l) => l.bedrooms === null))
    r.notes.push(`Listings that state ${input.minBedrooms}+ bedrooms come first; after them are listings that do not state bedrooms. Check those.`);
  return r;
}

async function searchOnce(db: ListingsDB, input: SearchInput, opts: { bedroomsUnknownOk?: boolean }): Promise<SearchResult> {
  const applied: Record<string, unknown> = {};
  const notes: string[] = [];
  const base = filters(input, applied, opts);
  const limit = input.limit ?? 10;
  const offset = input.offset ?? 0;
  const typed = input.query ? searchWords(input.query).slice(0, 12) : [];
  const words = correctPlaceWords(typed);
  const fixed = typed.flatMap((w, i) => (words[i] !== w ? [`${w} → ${words[i]}`] : []));
  if (fixed.length) notes.push(`Spelling corrected: ${fixed.join(", ")}.`);
  if (!words.length) {
    // Without keywords there is no relevance to rank by: "best match" means newest first.
    const sort = !input.sort || input.sort === "relevance" ? "newest" : input.sort;
    const r = await run(db, base, sql`0`, sort, limit, offset, opts.bedroomsUnknownOk);
    return { total: r.total, matchMode: "none", listings: r.rows.map(toCard), applied, notes };
  }
  applied.keywords = words;
  const strict = sql`to_tsquery('simple', ${words.map((w) => `${w}:*`).join(" & ")})`;
  const loose = sql`to_tsquery('simple', ${words.map((w) => `${w}:*`).join(" | ")})`;
  const phrase = words.join(" ");
  const r1 = await run(db, [...base, sql`${listings.search} @@ ${strict}`], sql`ts_rank_cd(${listings.search}, ${strict}, 1)`, input.sort, limit, offset, opts.bedroomsUnknownOk);
  if (r1.total > 0) return { total: r1.total, matchMode: "all", listings: r1.rows.map(toCard), applied, notes };
  const r2 = await run(
    db,
    [...base, sql`(${listings.search} @@ ${loose} or ${phrase} <% ${listings.searchText})`],
    sql`ts_rank_cd(${listings.search}, ${loose}, 1) + word_similarity(${phrase}, ${listings.searchText})`,
    input.sort,
    limit,
    offset,
    opts.bedroomsUnknownOk,
  );
  if (r2.total > 0) notes.push("No listing matched every word, so these match some of them. Results with more matching words come first.");
  return { total: r2.total, matchMode: "partial", listings: r2.rows.map(toCard), applied, notes };
}

export async function getListing(db: ListingsDB, code: string) {
  const [r] = await db.select().from(listings).where(eq(listings.code, code));
  return r ? { ...toCard(r), notes: r.notes, bathrooms: r.bathrooms, foreignEligible: r.foreignEligible, titleType: r.titleType, listedByEmail: r.listedByEmail, propertySubType: r.propertySubType, exclusive: r.exclusive, publishedAt: r.sourcePublishedAt?.toISOString() ?? null } : null;
}

export interface IndexFacets {
  totalAvailable: number;
  byTransaction: { value: string; count: number }[];
  byPropertyType: { value: string; count: number }[];
  byKind: { value: string; label: string; count: number }[];
  byProvince: { value: string; count: number }[];
  byCity: { city: string; province: string | null; count: number }[];
  priceGuide: { transaction: string; propertyType: string; count: number; min: number; median: number; max: number }[];
  updatedAt: string;
}

let facetCache: { at: number; data: IndexFacets } | null = null;
export const clearFacetCache = () => (facetCache = null);

/** The index's table of contents: what exists, where, and at what prices. Cached for 60 s. */
export async function facets(db: ListingsDB): Promise<IndexFacets> {
  if (facetCache && Date.now() - facetCache.at < 60_000) return facetCache.data;
  const avail = eq(listings.availability, "available");
  const count = sql<number>`count(*)::int`;
  const group = async (col: typeof listings.transactionType | typeof listings.propertyType | typeof listings.kind) =>
    (await db.select({ value: col, count }).from(listings).where(avail).groupBy(col).orderBy(desc(count))).map((r) => ({ value: r.value ?? "", count: r.count }));
  const [byTransaction, byPropertyType, kinds, byProvince, byCity, prices] = await Promise.all([
    group(listings.transactionType),
    group(listings.propertyType),
    group(listings.kind),
    db
      .select({ value: listings.province, count })
      .from(listings)
      .where(and(avail, sql`${listings.province} is not null`))
      .groupBy(listings.province)
      .orderBy(desc(count)),
    db
      .select({ city: listings.city, province: listings.province, count })
      .from(listings)
      .where(and(avail, sql`${listings.city} is not null`))
      .groupBy(listings.city, listings.province)
      .orderBy(desc(count))
      .limit(60),
    db
      .select({
        transaction: listings.transactionType,
        propertyType: listings.propertyType,
        count,
        min: sql<number>`min(${listings.pricePhp})::float8`,
        median: sql<number>`percentile_cont(0.5) within group (order by ${listings.pricePhp})::float8`,
        max: sql<number>`max(${listings.pricePhp})::float8`,
      })
      .from(listings)
      .where(avail)
      .groupBy(listings.transactionType, listings.propertyType)
      .orderBy(listings.transactionType, desc(count)),
  ]);
  const data: IndexFacets = {
    totalAvailable: byTransaction.reduce((s, r) => s + r.count, 0),
    byTransaction,
    byPropertyType,
    byKind: kinds.filter((k) => k.value).map((k) => ({ ...k, label: KINDS[k.value]?.label ?? k.value })),
    byProvince: byProvince.map((r) => ({ value: r.value!, count: r.count })),
    byCity: byCity.map((r) => ({ city: r.city!, province: r.province, count: r.count })),
    priceGuide: prices.map((p) => ({ ...p, min: Math.round(p.min), median: Math.round(p.median), max: Math.round(p.max) })),
    updatedAt: new Date().toISOString(),
  };
  facetCache = { at: Date.now(), data };
  return data;
}
