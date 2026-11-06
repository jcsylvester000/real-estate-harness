/**
 * Buyer–Seller Matching, both directions.
 *  WRITE (commands): saveBuyer, deleteBuyer → BuyerProfileSaved / BuyerProfileDeleted events
 *  READ  (queries):  matchNow       live scoring of the listing_search read model for any criteria
 *                    matchesForBuyer saved buyer → listings, from the match_results read model
 *                    buyersForListing listing → saved buyers, from match_results
 *                    listBuyers       saved buyers with how many listings match each
 */
import { and, desc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { command, keyOf, query } from "./cqrs";
import { KIND_GROUPS, buyerCriteria, describeCriteria, scoreListing, type BuyerCriteria, type MatchScore } from "./match";
import { toMatchListing } from "./projector";
import { KNOWN_CITIES, displayPlace } from "./places";
import { buyerProfiles, listingSearch, matchResults } from "./schema";
import { marketMedians, type ListingCard } from "./search";

export const buyerInput = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(2).max(80),
  notes: z.string().trim().max(1000).default(""),
  criteria: buyerCriteria,
});
export type BuyerInput = z.infer<typeof buyerInput>;

export interface MatchedListing {
  listing: ListingCard;
  match: MatchScore;
}

const expand = (ids: string[]) => [...new Set(ids.flatMap((k) => KIND_GROUPS[k]?.kinds ?? [k]))];
const provinceOfCity = (city: string) => KNOWN_CITIES.find((c) => displayPlace(c.city) === city)?.province ?? null;

/** SQL pre-filter from must-have criteria, so scoring only sees plausible candidates (uses the read-model indexes). */
function candidates(c: BuyerCriteria): SQL[] {
  const w: SQL[] = [eq(listingSearch.availability, "available"), eq(listingSearch.transactionType, c.transactionType)];
  if (c.kinds.length && c.kindImportance === "must") w.push(or(inArray(listingSearch.kind, expand(c.kinds)), eq(listingSearch.kind, ""))!);
  if (c.budgetImportance === "must") {
    if (c.budgetMax !== undefined) w.push(lte(listingSearch.pricePhp, String(c.budgetMax * 1.2)));
    if (c.budgetMin !== undefined) w.push(gte(listingSearch.pricePhp, String(c.budgetMin * 0.5)));
  }
  if (c.locationImportance === "must") {
    if (c.city) {
      const prov = c.province ?? provinceOfCity(c.city);
      w.push(prov ? or(eq(listingSearch.city, c.city), eq(listingSearch.province, prov))! : eq(listingSearch.city, c.city));
    } else if (c.province) w.push(eq(listingSearch.province, c.province));
    else if (c.region) w.push(eq(listingSearch.region, c.region));
  }
  return w;
}

const COLS = {
  code: listingSearch.code,
  transactionType: listingSearch.transactionType,
  propertyType: listingSearch.propertyType,
  kind: listingSearch.kind,
  pricePhp: listingSearch.pricePhp,
  city: listingSearch.city,
  province: listingSearch.province,
  region: listingSearch.region,
  locationTier: listingSearch.locationTier,
  bedrooms: listingSearch.bedrooms,
  areaSqm: listingSearch.areaSqm,
  pricePerSqm: listingSearch.pricePerSqm,
  features: listingSearch.features,
  quality: listingSearch.quality,
  card: listingSearch.card,
  analysis: listingSearch.analysis,
};

export interface MatchResult {
  total: number;
  /** Listings a must-have ruled out. */
  excluded: number;
  /** Listings that scored below the minimum. */
  belowMinimum: number;
  results: MatchedListing[];
  /** How many listings were scored. */
  scored: number;
}

/** Query: score listings against criteria now (no saving). Best first; only scores ≥ minScore. */
export function matchNow(criteria: BuyerCriteria, page: { limit?: number; offset?: number } = {}): Promise<MatchResult> {
  return query(keyOf("match", { criteria, page }), async (db) => {
    const [rows, market] = await Promise.all([db.select(COLS).from(listingSearch).where(and(...candidates(criteria))).limit(5000), marketMedians()]);
    let excluded = 0;
    let below = 0;
    const scored: MatchedListing[] = [];
    for (const r of rows) {
      const m = scoreListing(criteria, toMatchListing(r), market);
      if (m.excludedBy) excluded++;
      else if (m.score < criteria.minScore) below++;
      else scored.push({ listing: r.card as unknown as ListingCard, match: m });
    }
    scored.sort((a, b) => b.match.score - a.match.score || b.match.confidence - a.match.confidence || a.listing.price - b.listing.price);
    const offset = page.offset ?? 0;
    return { total: scored.length, excluded, belowMinimum: below, scored: rows.length, results: scored.slice(offset, offset + (page.limit ?? 24)) };
  });
}

// -- Saved buyers --

export async function saveBuyer(input: BuyerInput, actor?: string) {
  return command(actor ?? null, async (tx) => {
    const values = { label: input.label, notes: input.notes, criteria: input.criteria as unknown as Record<string, unknown>, updatedAt: new Date() };
    const [row] = input.id
      ? await tx.update(buyerProfiles).set(values).where(eq(buyerProfiles.id, input.id)).returning({ id: buyerProfiles.id })
      : await tx.insert(buyerProfiles).values({ ...values, createdBy: actor ?? null }).returning({ id: buyerProfiles.id });
    if (!row) throw new Error("Buyer profile not found.");
    return { result: row.id, events: [{ type: "BuyerProfileSaved" as const, keys: [row.id] as [string] }] };
  });
}

export async function deleteBuyer(id: string, actor?: string) {
  return command(actor ?? null, async (tx) => {
    const rows = await tx.delete(buyerProfiles).where(eq(buyerProfiles.id, id)).returning({ id: buyerProfiles.id });
    return { result: rows.length > 0, events: rows.length ? [{ type: "BuyerProfileDeleted" as const, keys: [id] as [string] }] : [] };
  });
}

export interface BuyerSummary {
  id: string;
  label: string;
  notes: string;
  criteria: BuyerCriteria;
  description: string;
  matches: number;
  topScore: number | null;
  updatedAt: string;
}

/** Query: saved buyers with their match counts (from the match_results read model). */
export function listBuyers(): Promise<BuyerSummary[]> {
  return query("buyers", async (db) => {
    const rows = await db.select().from(buyerProfiles).where(eq(buyerProfiles.active, true)).orderBy(desc(buyerProfiles.updatedAt)).limit(500);
    const counts = await db
      .select({ id: matchResults.profileId, n: sql<number>`count(*)::int`, top: sql<number>`max(${matchResults.score})` })
      .from(matchResults)
      .innerJoin(buyerProfiles, eq(buyerProfiles.id, matchResults.profileId))
      .where(sql`${matchResults.score} >= coalesce((${buyerProfiles.criteria}->>'minScore')::real, 5)`)
      .groupBy(matchResults.profileId);
    return rows.flatMap((r) => {
      const c = buyerCriteria.safeParse(r.criteria);
      if (!c.success) return [];
      const k = counts.find((x) => x.id === r.id);
      return [{ id: r.id, label: r.label, notes: r.notes, criteria: c.data, description: describeCriteria(c.data), matches: k?.n ?? 0, topScore: k?.top ?? null, updatedAt: r.updatedAt.toISOString() }];
    });
  });
}

/** Query: a saved buyer's matching listings, best first. */
export function matchesForBuyer(id: string, page: { limit?: number; offset?: number } = {}) {
  return query(keyOf("buyerMatches", { id, page }), async (db) => {
    const [p] = await db.select().from(buyerProfiles).where(eq(buyerProfiles.id, id));
    if (!p) return null;
    const c = buyerCriteria.parse(p.criteria);
    const where = and(eq(matchResults.profileId, id), gte(matchResults.score, c.minScore));
    const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(matchResults).where(where)) as [{ n: number }];
    const rows = await db
      .select({ score: matchResults.score, parts: matchResults.breakdown, card: listingSearch.card })
      .from(matchResults)
      .innerJoin(listingSearch, eq(listingSearch.code, matchResults.code))
      .where(where)
      .orderBy(desc(matchResults.score))
      .limit(page.limit ?? 24)
      .offset(page.offset ?? 0);
    return {
      profile: { id: p.id, label: p.label, notes: p.notes, criteria: c, description: describeCriteria(c) },
      total: n,
      results: rows.map((r) => ({ listing: r.card as unknown as ListingCard, match: { score: r.score, rating: Math.max(1, Math.min(10, Math.round(r.score))), parts: r.parts, confidence: confidenceOf(r.parts), excludedBy: null } as MatchScore })),
    };
  });
}

const confidenceOf = (parts: unknown[]) => {
  const p = parts as { importance: string; known: boolean }[];
  const w = { must: 3, important: 2, nice: 1, ignore: 0 } as Record<string, number>;
  const total = p.reduce((s, x) => s + (w[x.importance] ?? 0), 0);
  return total ? Math.round((p.filter((x) => x.known).reduce((s, x) => s + (w[x.importance] ?? 0), 0) / total) * 100) / 100 : 0;
};

/** Query: saved buyers who match a listing (the seller side of two-way matching). */
export function buyersForListing(code: string) {
  return query(keyOf("listingBuyers", code), async (db) => {
    const rows = await db
      .select({ id: buyerProfiles.id, label: buyerProfiles.label, criteria: buyerProfiles.criteria, score: matchResults.score, parts: matchResults.breakdown })
      .from(matchResults)
      .innerJoin(buyerProfiles, eq(buyerProfiles.id, matchResults.profileId))
      .where(and(eq(matchResults.code, code), sql`${matchResults.score} >= coalesce((${buyerProfiles.criteria}->>'minScore')::real, 5)`))
      .orderBy(desc(matchResults.score))
      .limit(20);
    return rows.map((r) => {
      const c = buyerCriteria.parse(r.criteria);
      return { id: r.id, label: r.label, description: describeCriteria(c), score: r.score, rating: Math.max(1, Math.min(10, Math.round(r.score))), parts: r.parts };
    });
  });
}
