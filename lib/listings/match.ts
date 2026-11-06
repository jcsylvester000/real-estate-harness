/**
 * Buyer–Seller Matching: scores a listing 1–10 against a buyer's criteria.
 *
 * Each criterion yields a fit from 0 to 1, weighted by the importance the user picked:
 *   must = 3 (and a fit under 0.5 excludes the listing), important = 2, nice = 1, ignore = 0.
 *   score = 1 + 9 × Σ(weight × fit) / Σ(weight)        → 1.0 (no fit) … 10.0 (perfect fit)
 * Unknown facts (bedrooms not stated, no area) score 0.5 and lower the match confidence, so a listing is
 * neither rewarded nor thrown out for missing data. A fixed "value" criterion compares price per sqm with
 * the market median for the same kind and area (from the listing_stats read model).
 */
import { z } from "zod";
import { FEATURE_IDS, FEATURES, PURPOSES, REGIONS, TIER_LABEL, regionOf, type LocationTier, type Purpose } from "./analyze";
import { displayPlace, KNOWN_CITIES } from "./places";
import { KIND_IDS, KINDS } from "./kinds";
import { php } from "./money";

export const IMPORTANCE = { must: 3, important: 2, nice: 1, ignore: 0 } as const;
export type Importance = keyof typeof IMPORTANCE;
const importance = z.enum(["must", "important", "nice", "ignore"]);

/** Kind groups a buyer can pick instead of one kind. */
export const KIND_GROUPS: Record<string, { label: string; kinds: string[] }> = {
  "any-residential": { label: "Any home (condo, house, townhouse)", kinds: ["condominium-unit", "house-and-lot", "townhouse", "apartment"] },
  "any-lot": { label: "Any lot", kinds: ["residential-lot", "subdivision-lot", "commercial-lot", "industrial-lot", "farm-lot"] },
  "any-commercial": { label: "Any commercial", kinds: ["office-space", "retail-space", "whole-commercial-building", "mixed-use-building", "hotel-resort", "commercial-lot"] },
  "any-industrial": { label: "Any industrial", kinds: ["warehouse", "industrial-lot", "industrial-compound"] },
};

export const buyerCriteria = z.object({
  transactionType: z.enum(["sale", "lease"]),
  kinds: z.array(z.enum([...KIND_IDS, ...Object.keys(KIND_GROUPS)] as [string, ...string[]])).max(8).default([]),
  kindImportance: importance.default("important"),
  city: z.string().trim().max(80).optional(),
  province: z.string().trim().max(80).optional(),
  region: z.enum(REGIONS).optional(),
  locationImportance: importance.default("important"),
  budgetMin: z.coerce.number().min(0).optional(),
  budgetMax: z.coerce.number().min(0).optional(),
  budgetImportance: importance.default("must"),
  minBedrooms: z.coerce.number().int().min(0).max(10).optional(),
  bedroomsImportance: importance.default("important"),
  minAreaSqm: z.coerce.number().min(0).optional(),
  areaImportance: importance.default("nice"),
  features: z.array(z.enum(FEATURE_IDS as [string, ...string[]])).max(12).default([]),
  featuresImportance: importance.default("nice"),
  purpose: z.enum(Object.keys(PURPOSES) as [Purpose, ...Purpose[]]).optional(),
  purposeImportance: importance.default("important"),
  /** Hide listings scoring below this (1–10). */
  minScore: z.coerce.number().min(1).max(10).default(5),
});
export type BuyerCriteria = z.infer<typeof buyerCriteria>;

/** The listing facts matching needs (columns of the listing_search read model). */
export interface MatchListing {
  code: string;
  transactionType: string;
  propertyType: string;
  kind: string;
  kindInferred: boolean;
  price: number;
  city: string | null;
  province: string | null;
  region: string | null;
  locationTier: LocationTier;
  bedrooms: number | null;
  areaSqm: number | null;
  pricePerSqm: number | null;
  features: string[];
  purposes: Record<Purpose, number>;
  quality: number;
}

export interface MatchPart {
  criterion: "kind" | "location" | "budget" | "bedrooms" | "area" | "features" | "purpose" | "value";
  label: string;
  importance: Importance;
  fit: number;
  known: boolean;
  reason: string;
}

export interface MatchScore {
  /** 1.0–10.0, one decimal. */
  score: number;
  /** Rounded 1–10 for badges. */
  rating: number;
  /** 0–1: share of weighted criteria the listing has data for. */
  confidence: number;
  excludedBy: MatchPart["criterion"] | null;
  parts: MatchPart[];
}

/** Market medians from the listing_stats read model, keyed "transaction|kind|province" and "transaction|kind|region". */
export type MarketMedians = Record<string, number>;

const expandKinds = (ids: string[]) => [...new Set(ids.flatMap((k) => KIND_GROUPS[k]?.kinds ?? [k]))];
const groupOf = (kind: string) => Object.entries(KIND_GROUPS).find(([, g]) => g.kinds.includes(kind))?.[0] ?? null;
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function scoreListing(c: BuyerCriteria, l: MatchListing, market: MarketMedians = {}): MatchScore {
  const parts: MatchPart[] = [];
  const add = (p: MatchPart) => parts.push({ ...p, fit: Math.max(0, Math.min(1, p.fit)) });
  const lease = c.transactionType === "lease";

  // Kind
  if (c.kinds.length) {
    const wanted = expandKinds(c.kinds);
    const label = c.kinds.map((k) => KIND_GROUPS[k]?.label ?? KINDS[k]?.label ?? k).join(" or ");
    if (!l.kind) {
      const typeOk = wanted.some((k) => KINDS[k]?.type === l.propertyType);
      add({ criterion: "kind", label: "Property kind", importance: c.kindImportance, fit: typeOk ? 0.5 : 0.1, known: false, reason: `Kind not stated (${l.propertyType}); you want ${label}` });
    } else if (wanted.includes(l.kind)) {
      add({ criterion: "kind", label: "Property kind", importance: c.kindImportance, fit: l.kindInferred ? 0.9 : 1, known: true, reason: `${KINDS[l.kind]?.label ?? l.kind}${l.kindInferred ? " (guessed from the name)" : ""}: what you want` });
    } else {
      const sameGroup = wanted.some((k) => groupOf(k) && groupOf(k) === groupOf(l.kind));
      const sameType = wanted.some((k) => KINDS[k]?.type === l.propertyType);
      add({ criterion: "kind", label: "Property kind", importance: c.kindImportance, fit: sameGroup ? 0.5 : sameType ? 0.3 : 0, known: true, reason: `${KINDS[l.kind]?.label ?? l.kind}, not ${label}` });
    }
  }

  // Location
  if (c.city || c.province || c.region) {
    let fit = 0;
    let reason = "";
    const where = [l.city, l.province].filter(Boolean).join(", ") || "location not stated";
    if (c.city) {
      if (l.city === c.city) [fit, reason] = [1, `In ${c.city}`];
      else if (c.province && l.province === c.province) [fit, reason] = [0.6, `Same province (${where})`];
      else if (!c.province && l.province && l.province === provinceOfCity(c.city, l)) [fit, reason] = [0.6, `Nearby: ${where}`];
      else if (c.region && l.region === c.region) [fit, reason] = [0.3, `Same region (${where})`];
      else [fit, reason] = [l.province ? 0 : 0.2, l.province ? `${where}, not ${c.city}` : "Location not stated"];
    } else if (c.province) {
      if (l.province === c.province) [fit, reason] = [1, `In ${c.province}${l.city ? ` (${l.city})` : ""}`];
      else if (c.region ? l.region === c.region : l.region && l.region === REGION_OF_PROVINCE(c.province)) [fit, reason] = [0.4, `Same region (${where})`];
      else [fit, reason] = [l.province ? 0 : 0.2, l.province ? `${where}, not ${c.province}` : "Location not stated"];
    } else if (c.region) {
      [fit, reason] = l.region === c.region ? [1, `In ${c.region} (${where})`] : [l.region ? 0 : 0.2, l.region ? `${where}, outside ${c.region}` : "Location not stated"];
    }
    add({ criterion: "location", label: "Location", importance: c.locationImportance, fit, known: !!(l.city || l.province), reason: `${reason} · ${TIER_LABEL[l.locationTier]}` });
  }

  // Budget
  if (c.budgetMin !== undefined || c.budgetMax !== undefined) {
    const p = l.price;
    const unit = lease ? "/mo" : "";
    let fit = 1;
    let reason = `${php(p)}${unit}: within budget`;
    if (c.budgetMax !== undefined && p > c.budgetMax) {
      const over = (p - c.budgetMax) / Math.max(1, c.budgetMax);
      fit = 1 - over / 0.2;
      reason = `${php(p)}${unit}: ${pct(over)} over budget`;
    } else if (c.budgetMin !== undefined && p < c.budgetMin) {
      const under = (c.budgetMin - p) / Math.max(1, c.budgetMin);
      fit = Math.max(0.3, 1 - under);
      reason = `${php(p)}${unit}: ${pct(under)} below your range`;
    }
    add({ criterion: "budget", label: "Budget", importance: c.budgetImportance, fit, known: true, reason });
  }

  // Bedrooms
  if (c.minBedrooms !== undefined && c.minBedrooms > 0) {
    if (l.bedrooms === null) add({ criterion: "bedrooms", label: "Bedrooms", importance: c.bedroomsImportance, fit: 0.5, known: false, reason: "Bedrooms not stated" });
    else {
      const d = l.bedrooms - c.minBedrooms;
      add({ criterion: "bedrooms", label: "Bedrooms", importance: c.bedroomsImportance, fit: d >= 0 ? 1 : d === -1 ? 0.4 : 0, known: true, reason: `${l.bedrooms === 0 ? "Studio" : `${l.bedrooms} BR`}; you want ${c.minBedrooms}+` });
    }
  }

  // Area
  if (c.minAreaSqm) {
    if (l.areaSqm === null) add({ criterion: "area", label: "Size", importance: c.areaImportance, fit: 0.5, known: false, reason: "Size not stated" });
    else {
      const r = l.areaSqm / c.minAreaSqm;
      add({ criterion: "area", label: "Size", importance: c.areaImportance, fit: r >= 1 ? 1 : r >= 0.85 ? 0.6 : r >= 0.7 ? 0.3 : 0, known: true, reason: `${l.areaSqm.toLocaleString()} sqm; you want ${c.minAreaSqm.toLocaleString()}+` });
    }
  }

  // Features
  if (c.features.length) {
    const has = c.features.filter((f) => l.features.includes(f));
    const miss = c.features.filter((f) => !l.features.includes(f));
    add({
      criterion: "features",
      label: "Features",
      importance: c.featuresImportance,
      fit: has.length / c.features.length,
      known: l.quality >= 0.6 || has.length > 0,
      reason: [has.length ? `Has: ${has.map((f) => FEATURES[f]!.label.toLowerCase()).join(", ")}` : "", miss.length ? `Not mentioned: ${miss.map((f) => FEATURES[f]!.label.toLowerCase()).join(", ")}` : ""].filter(Boolean).join(". "),
    });
  }

  // Purpose
  if (c.purpose) {
    const fit = l.purposes[c.purpose] ?? 0;
    add({ criterion: "purpose", label: "Purpose", importance: c.purposeImportance, fit, known: true, reason: `${fit >= 0.75 ? "Strong" : fit >= 0.45 ? "Fair" : "Weak"} fit for ${PURPOSES[c.purpose].toLowerCase()}` });
  }

  // Value (fixed "nice"): price per sqm against the market median for the same kind and area.
  if (l.pricePerSqm && l.kind) {
    const median = market[`${l.transactionType}|${l.kind}|${l.province}`] ?? market[`${l.transactionType}|${l.kind}|${l.region}`];
    if (median) {
      const r = l.pricePerSqm / median;
      add({
        criterion: "value",
        label: "Value",
        importance: "nice",
        fit: r <= 0.85 ? 1 : r <= 1 ? 0.8 : r <= 1.15 ? 0.5 : 0.2,
        known: true,
        reason: `${php(l.pricePerSqm)}/sqm${lease ? "/mo" : ""} is ${r <= 1 ? `${pct(1 - r)} below` : `${pct(r - 1)} above`} the median for this kind in ${l.province ?? l.region}`,
      });
    }
  }

  // A must-have that clearly fails excludes the listing; the transaction type always must match.
  const excluded = l.transactionType !== c.transactionType ? ("kind" as const) : (parts.find((p) => p.importance === "must" && p.known && p.fit < 0.5)?.criterion ?? null);
  const weighted = parts.filter((p) => IMPORTANCE[p.importance] > 0);
  const total = weighted.reduce((s, p) => s + IMPORTANCE[p.importance], 0);
  const raw = total ? weighted.reduce((s, p) => s + IMPORTANCE[p.importance] * p.fit, 0) / total : 0.5;
  const score = Math.round((1 + 9 * raw) * 10) / 10;
  const confidence = total ? Math.round((weighted.filter((p) => p.known).reduce((s, p) => s + IMPORTANCE[p.importance], 0) / total) * 100) / 100 : 0;
  return { score, rating: Math.max(1, Math.min(10, Math.round(score))), confidence, excludedBy: excluded, parts };
}

const REGION_OF_PROVINCE = (p: string) => regionOf(p);
function provinceOfCity(city: string, _l: MatchListing) {
  void _l;
  return KNOWN_CITIES.find((c) => displayPlace(c.city) === city)?.province ?? null;
}

/** One-line description of criteria, for saved buyer lists. */
export function describeCriteria(c: BuyerCriteria) {
  const kinds = c.kinds.map((k) => KIND_GROUPS[k]?.label ?? KINDS[k]?.label ?? k).join(" or ") || "Any property";
  const where = c.city ?? c.province ?? c.region ?? "anywhere";
  const budget =
    c.budgetMax !== undefined ? `up to ${php(c.budgetMax)}${c.transactionType === "lease" ? "/mo" : ""}` : c.budgetMin !== undefined ? `from ${php(c.budgetMin)}` : "any budget";
  return `${kinds} for ${c.transactionType === "lease" ? "rent" : "sale"} in ${where}, ${budget}${c.minBedrooms ? `, ${c.minBedrooms}+ BR` : ""}`;
}
