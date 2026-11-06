/**
 * The projector: turns the event log into the read models.
 *   listing_search  one denormalized row per listing (card, analysis, search index)
 *   listing_stats   "facets" (counts) and "market" (median price per sqm by kind and area)
 *   match_results   saved buyer × listing scores, kept for scores ≥ MATCH_KEEP
 * It processes events after its checkpoint, under an advisory lock so two instances never project at once.
 * A change to PROJECTION_VERSION (new read-model shape) triggers a full rebuild from the write model.
 */
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { ListingsDB } from "./db";
import { analyzeListing, type ListingAnalysis } from "./analyze";
import { KINDS, kindWords } from "./kinds";
import { buyerCriteria, scoreListing, type BuyerCriteria, type MarketMedians, type MatchListing } from "./match";
import { normalizeText } from "./normalize";
import { buyerProfiles, events, listingSearch, listingStats, listings, matchResults, projectionState } from "./schema";

export const PROJECTION_VERSION = 1;
const NAME = "listings";
const LOCK = 7311201;
const CHUNK = 250;
/** Scores below this are not stored as matches (the buyer page can still search live). */
export const MATCH_KEEP = 5;

type Row = typeof listings.$inferSelect;
type Db = Pick<ListingsDB, "select" | "insert" | "update" | "delete" | "execute">;

/** Read-model row for one listing. */
export function readRow(r: Row) {
  const price = Number(r.pricePhp);
  const floor = r.floorAreaSqm === null ? null : Number(r.floorAreaSqm);
  const lot = r.lotAreaSqm === null ? null : Number(r.lotAreaSqm);
  const a: ListingAnalysis = analyzeListing({
    code: r.code,
    name: r.name,
    notes: r.notes,
    location: r.location,
    transactionType: r.transactionType,
    propertyType: r.propertyType,
    kind: r.kind,
    kindInferred: r.kindInferred,
    price,
    city: r.city,
    province: r.province,
    bedrooms: r.bedrooms,
    floorAreaSqm: floor,
    lotAreaSqm: lot,
  });
  const nameNorm = normalizeText(r.name);
  const placeNorm = normalizeText([r.location, r.city, r.province, a.region].filter(Boolean).join(" "));
  const card = {
    code: r.code,
    name: r.name,
    availability: r.availability,
    transactionType: r.transactionType,
    propertyType: r.propertyType,
    kind: r.kind,
    kindLabel: KINDS[r.kind]?.label ?? (r.kind ? r.kind.replace(/-/g, " ") : "Not stated"),
    kindInferred: r.kindInferred,
    price,
    location: r.location,
    city: r.city,
    province: r.province,
    region: a.region,
    locationTier: a.locationTier,
    bedrooms: r.bedrooms,
    floorAreaSqm: floor,
    lotAreaSqm: lot,
    gridVerification: r.gridVerification,
    source: r.source,
    listedBy: r.listedBy,
    listedByType: r.listedByType,
    features: a.features,
    quality: a.quality,
    summary: a.summary,
    updatedAt: r.updatedAt.toISOString(),
  };
  return {
    code: r.code,
    source: r.source,
    availability: r.availability,
    transactionType: r.transactionType,
    propertyType: r.propertyType,
    kind: r.kind,
    pricePhp: r.pricePhp,
    city: r.city,
    province: r.province,
    region: a.region,
    locationTier: a.locationTier,
    bedrooms: r.bedrooms,
    areaSqm: a.areaSqm,
    pricePerSqm: a.pricePerSqm,
    features: a.features,
    quality: a.quality,
    card,
    analysis: a as unknown as Record<string, unknown>,
    sortDate: r.sourcePublishedAt ?? r.sourceCreatedAt ?? r.createdAt,
    nameNorm,
    placeNorm,
    kindNorm: normalizeText(kindWords(r.kind, r.propertyType, r.transactionType)),
    notesNorm: normalizeText(r.notes).slice(0, 4000),
    searchText: `${nameNorm} ${placeNorm}`.slice(0, 1000),
    projectedAt: new Date(),
  };
}

const READ_SET = Object.fromEntries(
  ["source", "availability", "transactionType", "propertyType", "kind", "pricePhp", "city", "province", "region", "locationTier", "bedrooms", "areaSqm", "pricePerSqm", "features", "quality", "card", "analysis", "sortDate", "nameNorm", "placeNorm", "kindNorm", "notesNorm", "searchText", "projectedAt"].map((k) => [
    k,
    sql.raw(`excluded.${k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`),
  ]),
);

async function projectListings(db: Db, codes: string[] | "all") {
  if (codes === "all") {
    await db.delete(listingSearch);
    for (let offset = 0; ; offset += CHUNK) {
      const rows = await db.select().from(listings).orderBy(listings.code).limit(CHUNK).offset(offset);
      if (!rows.length) break;
      await db.insert(listingSearch).values(rows.map(readRow));
    }
    return;
  }
  for (let i = 0; i < codes.length; i += CHUNK) {
    const part = codes.slice(i, i + CHUNK);
    const rows = await db.select().from(listings).where(inArray(listings.code, part));
    if (rows.length) await db.insert(listingSearch).values(rows.map(readRow)).onConflictDoUpdate({ target: listingSearch.code, set: READ_SET });
    const gone = part.filter((c) => !rows.some((r) => r.code === c));
    if (gone.length) {
      await db.delete(listingSearch).where(inArray(listingSearch.code, gone));
      await db.delete(matchResults).where(inArray(matchResults.code, gone));
    }
  }
}

/** Facets and market medians, from the read model itself. */
async function projectStats(db: Db) {
  const avail = eq(listingSearch.availability, "available");
  const count = sql<number>`count(*)::int`;
  const group = async (col: typeof listingSearch.transactionType | typeof listingSearch.propertyType | typeof listingSearch.kind | typeof listingSearch.region) =>
    (await db.select({ value: col, count }).from(listingSearch).where(avail).groupBy(col).orderBy(desc(count))).filter((r) => r.value).map((r) => ({ value: r.value as string, count: r.count }));
  const [byTransaction, byPropertyType, kinds, byRegion] = await Promise.all([group(listingSearch.transactionType), group(listingSearch.propertyType), group(listingSearch.kind), group(listingSearch.region)]);
  const byProvince = await db
    .select({ value: listingSearch.province, count })
    .from(listingSearch)
    .where(and(avail, sql`${listingSearch.province} is not null`))
    .groupBy(listingSearch.province)
    .orderBy(desc(count));
  const byCity = await db
    .select({ city: listingSearch.city, province: listingSearch.province, count })
    .from(listingSearch)
    .where(and(avail, sql`${listingSearch.city} is not null`))
    .groupBy(listingSearch.city, listingSearch.province)
    .orderBy(desc(count))
    .limit(80);
  const prices = await db
    .select({
      transaction: listingSearch.transactionType,
      propertyType: listingSearch.propertyType,
      count,
      min: sql<number>`min(${listingSearch.pricePhp})::float8`,
      median: sql<number>`percentile_cont(0.5) within group (order by ${listingSearch.pricePhp})::float8`,
      max: sql<number>`max(${listingSearch.pricePhp})::float8`,
    })
    .from(listingSearch)
    .where(avail)
    .groupBy(listingSearch.transactionType, listingSearch.propertyType)
    .orderBy(listingSearch.transactionType, desc(count));
  const facets = {
    totalAvailable: byTransaction.reduce((s, r) => s + r.count, 0),
    byTransaction,
    byPropertyType,
    byKind: kinds.map((k) => ({ ...k, label: KINDS[k.value]?.label ?? k.value })),
    byRegion,
    byProvince: byProvince.map((r) => ({ value: r.value!, count: r.count })),
    byCity: byCity.map((r) => ({ city: r.city!, province: r.province, count: r.count })),
    priceGuide: prices.map((p) => ({ ...p, min: Math.round(p.min), median: Math.round(p.median), max: Math.round(p.max) })),
    updatedAt: new Date().toISOString(),
  };
  // Median price per sqm by transaction × kind × province and × region (at least 3 listings each).
  const market: MarketMedians = {};
  for (const level of ["province", "region"] as const) {
    const col = level === "province" ? listingSearch.province : listingSearch.region;
    const rows = await db
      .select({ t: listingSearch.transactionType, k: listingSearch.kind, a: col, n: count, m: sql<number>`percentile_cont(0.5) within group (order by ${listingSearch.pricePerSqm})::float8` })
      .from(listingSearch)
      .where(and(avail, sql`${listingSearch.pricePerSqm} is not null`, sql`${listingSearch.kind} <> ''`, sql`${col} is not null`))
      .groupBy(listingSearch.transactionType, listingSearch.kind, col);
    for (const r of rows) if (r.n >= 3) market[`${r.t}|${r.k}|${r.a}`] = Math.round(r.m * 100) / 100;
  }
  for (const [key, data] of [
    ["facets", facets],
    ["market", market],
  ] as const)
    await db
      .insert(listingStats)
      .values({ key, data: data as Record<string, unknown> })
      .onConflictDoUpdate({ target: listingStats.key, set: { data: data as Record<string, unknown>, updatedAt: new Date() } });
  return market;
}

type SearchRow = typeof listingSearch.$inferSelect;
export const toMatchListing = (r: Pick<SearchRow, "code" | "transactionType" | "propertyType" | "kind" | "pricePhp" | "city" | "province" | "region" | "locationTier" | "bedrooms" | "areaSqm" | "pricePerSqm" | "features" | "quality" | "card" | "analysis">): MatchListing => ({
  code: r.code,
  transactionType: r.transactionType,
  propertyType: r.propertyType,
  kind: r.kind,
  kindInferred: Boolean((r.card as { kindInferred?: boolean }).kindInferred),
  price: Number(r.pricePhp),
  city: r.city,
  province: r.province,
  region: r.region,
  locationTier: r.locationTier as MatchListing["locationTier"],
  bedrooms: r.bedrooms,
  areaSqm: r.areaSqm,
  pricePerSqm: r.pricePerSqm,
  features: r.features,
  purposes: (r.analysis as unknown as ListingAnalysis).purposes,
  quality: r.quality,
});

/** Recomputes stored matches for some profiles (against all listings) and/or some listings (against all profiles). */
async function projectMatches(db: Db, market: MarketMedians, scope: { profiles: string[] | "all"; listings: string[] }) {
  const profiles = await db.select().from(buyerProfiles).where(eq(buyerProfiles.active, true)).limit(1000);
  const parsed = profiles.flatMap((p) => {
    const c = buyerCriteria.safeParse(p.criteria);
    return c.success ? [{ id: p.id, criteria: c.data }] : [];
  });
  const store = async (id: string, criteria: BuyerCriteria, rows: SearchRow[]) => {
    const keep = rows.flatMap((r) => {
      const m = scoreListing(criteria, toMatchListing(r), market);
      return !m.excludedBy && m.score >= MATCH_KEEP ? [{ profileId: id, code: r.code, score: m.score, breakdown: m.parts as unknown[] }] : [];
    });
    for (let i = 0; i < keep.length; i += CHUNK)
      await db
        .insert(matchResults)
        .values(keep.slice(i, i + CHUNK))
        .onConflictDoUpdate({ target: [matchResults.profileId, matchResults.code], set: { score: sql`excluded.score`, breakdown: sql`excluded.breakdown`, computedAt: new Date() } });
  };
  // Whole profiles: replace their matches.
  const fullIds = scope.profiles === "all" ? parsed.map((p) => p.id) : scope.profiles;
  if (fullIds.length) {
    await db.delete(matchResults).where(inArray(matchResults.profileId, fullIds));
    const avail = await db.select().from(listingSearch).where(eq(listingSearch.availability, "available"));
    for (const p of parsed.filter((x) => fullIds.includes(x.id))) await store(p.id, p.criteria, avail.filter((r) => r.transactionType === p.criteria.transactionType));
  }
  // Changed listings: rescore against every other profile.
  if (scope.listings.length) {
    const others = parsed.filter((p) => !fullIds.includes(p.id));
    for (let i = 0; i < scope.listings.length; i += CHUNK) {
      const part = scope.listings.slice(i, i + CHUNK);
      if (others.length) await db.delete(matchResults).where(and(inArray(matchResults.code, part), inArray(matchResults.profileId, others.map((o) => o.id))));
      const rows = await db.select().from(listingSearch).where(and(inArray(listingSearch.code, part), eq(listingSearch.availability, "available")));
      for (const p of others) await store(p.id, p.criteria, rows.filter((r) => r.transactionType === p.criteria.transactionType));
    }
  }
}

/**
 * Brings the read models up to date with the event log. Returns the new read-model version.
 * Safe to call from anywhere; concurrent callers wait on the advisory lock and then find nothing to do.
 */
export async function project(db: ListingsDB): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK})`);
    const [state] = await tx.select().from(projectionState).where(eq(projectionState.name, NAME));
    const rebuild = !state || state.schemaVersion !== PROJECTION_VERSION;
    const pending = await tx
      .select({ id: events.id, type: events.type, keys: events.keys })
      .from(events)
      .where(gt(events.id, rebuild ? 0 : state!.lastEventId))
      .orderBy(events.id)
      .limit(rebuild ? 1 : 100_000);
    if (!rebuild && !pending.length) return state!.version;
    const lastId = rebuild ? Number((await tx.select({ m: sql<number>`coalesce(max(${events.id}),0)` }).from(events))[0]?.m ?? 0) : pending[pending.length - 1]!.id;

    const listingCodes = new Set<string>();
    const profileIds = new Set<string>();
    const deletedProfiles = new Set<string>();
    for (const e of pending) {
      if (e.type.startsWith("Listing")) e.keys.forEach((k) => listingCodes.add(k));
      if (e.type === "BuyerProfileSaved") e.keys.forEach((k) => profileIds.add(k));
      if (e.type === "BuyerProfileDeleted") e.keys.forEach((k) => deletedProfiles.add(k));
    }

    if (rebuild) await projectListings(tx, "all");
    else if (listingCodes.size) await projectListings(tx, [...listingCodes]);
    const listingsChanged = rebuild || listingCodes.size > 0;
    let market: MarketMedians;
    if (listingsChanged) market = await projectStats(tx);
    else market = ((await tx.select().from(listingStats).where(eq(listingStats.key, "market")))[0]?.data ?? {}) as MarketMedians;
    if (deletedProfiles.size) await tx.delete(matchResults).where(inArray(matchResults.profileId, [...deletedProfiles]));
    if (rebuild) {
      await tx.delete(matchResults);
      await projectMatches(tx, market, { profiles: "all", listings: [] });
    } else if (profileIds.size || listingCodes.size) {
      // A market shift (stats changed) slightly moves every "value" score; those refresh on the next profile save or rebuild.
      await projectMatches(tx, market, { profiles: [...profileIds].filter((p) => !deletedProfiles.has(p)), listings: [...listingCodes] });
    }

    const version = (state?.version ?? 0) + 1;
    await tx
      .insert(projectionState)
      .values({ name: NAME, lastEventId: lastId, version, schemaVersion: PROJECTION_VERSION })
      .onConflictDoUpdate({ target: projectionState.name, set: { lastEventId: lastId, version, schemaVersion: PROJECTION_VERSION, updatedAt: new Date() } });
    return version;
  });
}
