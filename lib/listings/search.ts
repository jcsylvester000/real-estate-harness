/**
 * READ SIDE (queries): searching the listing_search read model (never the write model, except the one-listing
 * detail lookup). Results come from the precomputed card column, so a search does no per-row mapping.
 * Keyword search runs in two passes: every word must match (ranked by ts_rank_cd over the weighted tsvector);
 * if nothing matches, any word may match, plus trigram word-similarity for typos ("makatti", "paranaque").
 * Filters use the btree indexes. Results never include contact emails; the AI shape also omits the uploader.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { ListingsDB } from "./db";
import { AVAILABILITY, KIND_IDS, PROPERTY_TYPES, TRANSACTION_TYPES } from "./kinds";
import { normalizeText, searchWords } from "./normalize";
import { correctPlaceWords, resolvePlaceFuzzy } from "./places";
import { keyOf, query } from "./cqrs";
import { listings, listingSearch, listingStats } from "./schema";

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
  region: string | null;
  locationTier: string;
  bedrooms: number | null;
  floorAreaSqm: number | null;
  lotAreaSqm: number | null;
  gridVerification: string;
  source: string;
  listedBy: string;
  listedByType: string;
  features: string[];
  /** 0–1 data completeness from the listing analysis. */
  quality: number;
  summary: string;
  updatedAt: string;
}

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
  w.push(inArray(listingSearch.availability, avail));
  applied.availability = avail;
  if (f.transactionType) w.push(eq(listingSearch.transactionType, (applied.transactionType = f.transactionType)));
  if (f.kind) w.push(eq(listingSearch.kind, (applied.kind = f.kind)));
  else if (f.propertyType) w.push(eq(listingSearch.propertyType, (applied.propertyType = f.propertyType)));
  if (f.city || f.province) {
    const p = f.city ? resolvePlaceFuzzy(f.city) : { city: null, province: null };
    const prov = f.province ? (resolvePlaceFuzzy(f.province).province ?? f.province) : null;
    if (p.city) w.push(eq(listingSearch.city, (applied.city = p.city)));
    else if (p.province || prov) w.push(eq(listingSearch.province, (applied.province = (p.province ?? prov)!)));
    else if (f.city) {
      // Unknown place name: match it as text in the location instead.
      const like = `%${normalizeText(f.city)}%`;
      w.push(sql`${listingSearch.placeNorm} like ${like}`);
      applied.placeText = f.city;
    }
  }
  if (f.minPrice !== undefined) w.push(gte(listingSearch.pricePhp, String((applied.minPrice = f.minPrice))));
  if (f.maxPrice !== undefined) w.push(lte(listingSearch.pricePhp, String((applied.maxPrice = f.maxPrice))));
  if (f.minBedrooms !== undefined) {
    applied.minBedrooms = f.minBedrooms;
    w.push(opts.bedroomsUnknownOk ? sql`(${listingSearch.bedrooms} >= ${f.minBedrooms} or ${listingSearch.bedrooms} is null)` : gte(listingSearch.bedrooms, f.minBedrooms));
  }
  const area = sql`${listingSearch.areaSqm}`;
  if (f.minAreaSqm !== undefined) w.push(sql`${area} >= ${(applied.minAreaSqm = f.minAreaSqm)}`);
  if (f.maxAreaSqm !== undefined) w.push(sql`${area} <= ${(applied.maxAreaSqm = f.maxAreaSqm)}`);
  if (f.source) w.push(eq(listingSearch.source, (applied.source = f.source)));
  return w;
}

async function run(db: ListingsDB, where: SQL[], rank: SQL, sort: SearchInput["sort"], limit: number, offset: number, knownBedroomsFirst = false) {
  const order =
    sort === "price_asc"
      ? [asc(listingSearch.pricePhp)]
      : sort === "price_desc"
        ? [desc(listingSearch.pricePhp)]
        : sort === "newest"
          ? [desc(sql`${listingSearch.sortDate}`)]
          : [desc(rank), asc(listingSearch.pricePhp)];
  const first = knownBedroomsFirst ? [asc(sql`(${listingSearch.bedrooms} is null)`)] : [];
  const rows = await db
    .select({ card: listingSearch.card, total: sql<number>`count(*) over()`.mapWith(Number) })
    .from(listingSearch)
    .where(and(...where))
    .orderBy(...first, ...order)
    .limit(limit)
    .offset(offset);
  return { total: rows[0]?.total ?? 0, rows: rows.map((r) => r.card as unknown as ListingCard) };
}

/** Query: search the listings index. Cached per input until the read models change. */
export function searchListings(input: SearchInput): Promise<SearchResult> {
  return query(keyOf("search", input), async (db) => {
    // Many listings (mostly houses and lots) do not state bedrooms. With a bedroom filter, listings that state
    // enough bedrooms come first, then those that do not say, so nothing suitable is hidden.
    const r = await searchOnce(db, input, { bedroomsUnknownOk: input.minBedrooms !== undefined });
    if (input.minBedrooms !== undefined && r.listings.some((l) => l.bedrooms === null))
      r.notes.push(`Listings that state ${input.minBedrooms}+ bedrooms come first; after them are listings that do not state bedrooms. Check those.`);
    return r;
  });
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
    return { total: r.total, matchMode: "none", listings: r.rows, applied, notes };
  }
  applied.keywords = words;
  const strict = sql`to_tsquery('simple', ${words.map((w) => `${w}:*`).join(" & ")})`;
  const loose = sql`to_tsquery('simple', ${words.map((w) => `${w}:*`).join(" | ")})`;
  const phrase = words.join(" ");
  const r1 = await run(db, [...base, sql`${listingSearch.search} @@ ${strict}`], sql`ts_rank_cd(${listingSearch.search}, ${strict}, 1)`, input.sort, limit, offset, opts.bedroomsUnknownOk);
  if (r1.total > 0) return { total: r1.total, matchMode: "all", listings: r1.rows, applied, notes };
  const r2 = await run(
    db,
    [...base, sql`(${listingSearch.search} @@ ${loose} or ${phrase} <% ${listingSearch.searchText})`],
    sql`ts_rank_cd(${listingSearch.search}, ${loose}, 1) + word_similarity(${phrase}, ${listingSearch.searchText})`,
    input.sort,
    limit,
    offset,
    opts.bedroomsUnknownOk,
  );
  if (r2.total > 0) notes.push("No listing matched every word, so these match some of them. Results with more matching words come first.");
  return { total: r2.total, matchMode: "partial", listings: r2.rows, applied, notes };
}

export type ListingDetail = ListingCard & {
  notes: string;
  bathrooms: number | null;
  foreignEligible: boolean | null;
  titleType: string;
  listedByEmail: string;
  propertySubType: string;
  exclusive: boolean;
  publishedAt: string | null;
  analysis: Record<string, unknown>;
};

/** Query: one listing — its read-model card and analysis plus the detail fields only a single view needs. */
export function getListing(code: string): Promise<ListingDetail | null> {
  return query(keyOf("listing", code), async (db) => {
    const [r] = await db
      .select({ card: listingSearch.card, analysis: listingSearch.analysis, w: listings })
      .from(listingSearch)
      .innerJoin(listings, eq(listings.code, listingSearch.code))
      .where(eq(listingSearch.code, code));
    if (!r) return null;
    return {
      ...(r.card as unknown as ListingCard),
      notes: r.w.notes,
      bathrooms: r.w.bathrooms,
      foreignEligible: r.w.foreignEligible,
      titleType: r.w.titleType,
      listedByEmail: r.w.listedByEmail,
      propertySubType: r.w.propertySubType,
      exclusive: r.w.exclusive,
      publishedAt: r.w.sourcePublishedAt?.toISOString() ?? null,
      analysis: r.analysis,
    };
  });
}

export interface IndexFacets {
  totalAvailable: number;
  byTransaction: { value: string; count: number }[];
  byPropertyType: { value: string; count: number }[];
  byKind: { value: string; label: string; count: number }[];
  byRegion: { value: string; count: number }[];
  byProvince: { value: string; count: number }[];
  byCity: { city: string; province: string | null; count: number }[];
  priceGuide: { transaction: string; propertyType: string; count: number; min: number; median: number; max: number }[];
  updatedAt: string;
}

const EMPTY_FACETS: IndexFacets = { totalAvailable: 0, byTransaction: [], byPropertyType: [], byKind: [], byRegion: [], byProvince: [], byCity: [], priceGuide: [], updatedAt: new Date(0).toISOString() };

/** Query: the index's table of contents (counts and price guide), precomputed by the projector. */
export function facets(): Promise<IndexFacets> {
  return query("facets", async (db) => {
    const [r] = await db.select().from(listingStats).where(eq(listingStats.key, "facets"));
    return (r?.data as unknown as IndexFacets) ?? EMPTY_FACETS;
  });
}

/** Query: median price per sqm by transaction|kind|province and |region (for value scoring). */
export function marketMedians(): Promise<Record<string, number>> {
  return query("market", async (db) => {
    const [r] = await db.select().from(listingStats).where(eq(listingStats.key, "market"));
    return (r?.data as Record<string, number>) ?? {};
  });
}
