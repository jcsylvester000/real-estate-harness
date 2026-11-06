/**
 * No-AI inquiry parser: turns "2BR condo for rent in BGC under 60k" into listings-index filters.
 * Used by Property Finder and by Deal Desk's Demo mode, so property search works with no AI key.
 * What it cannot place becomes keywords for the full-text search.
 */
import { KINDS, kindFromText } from "./kinds";
import { normalizeText, parseBedrooms } from "./normalize";
import { resolvePlaceFuzzy } from "./places";
import type { SearchInput } from "./search";

export interface ParsedInquiry {
  filters: SearchInput;
  /** Human-readable chips: what was understood. */
  understood: { field: keyof SearchInput; label: string }[];
}

const AMOUNT = String.raw`(?:₱|php|p)?\s*(\d+(?:[.,]\d+)*)\s*(million|mil|m|thousand|k)?\b`;
function amount(num: string, unit?: string) {
  const unitless = !unit;
  const n = Number(unitless ? num.replace(/,/g, "") : num.replace(/,/g, ""));
  if (!Number.isFinite(n)) return undefined;
  const u = (unit ?? "").toLowerCase();
  if (u.startsWith("m")) return n * 1_000_000;
  if (u === "k" || u === "thousand") return n * 1_000;
  return n;
}

const FILLER = new Set(
  "looking want need needs client clients buyer buyers find show me us please property properties unit units any some available listing listings in at near around about approx approximately under below above over less more than between and to up budget max maximum min minimum least within of per month monthly year price priced php pesos peso million mil thousand br bedroom bedrooms bed beds sqm sq square meters metres m2 floor area lot size with a an the for sale lease rent rental renting buy buying purchase investment i we my our that is are can you have has do does what which who how many much".split(
    " ",
  ),
);

const peso = (n: number) => `₱${n.toLocaleString("en-PH")}`;

export function parseInquiry(text: string): ParsedInquiry {
  const t = text.toLowerCase();
  const filters: SearchInput = {};
  const understood: ParsedInquiry["understood"] = [];

  // Transaction
  if (/\b(rent|rental|lease|leasing|for rent|monthly|per month|\/mo)\b/.test(t)) filters.transactionType = "lease";
  else if (/\b(buy|buying|for sale|purchase|sale|invest)\b/.test(t)) filters.transactionType = "sale";
  if (filters.transactionType) understood.push({ field: "transactionType", label: filters.transactionType === "lease" ? "For rent" : "For sale" });

  // Kind or broad type
  const kind = kindFromText(t);
  if (kind) {
    filters.kind = kind;
    understood.push({ field: "kind", label: KINDS[kind]!.label });
  } else {
    const broad = (["commercial", "industrial", "agricultural", "residential"] as const).find((w) => t.includes(w));
    if (broad) {
      filters.propertyType = broad;
      understood.push({ field: "propertyType", label: broad[0]!.toUpperCase() + broad.slice(1) });
    }
  }

  // Place
  const place = resolvePlaceFuzzy(text);
  if (place.city) {
    filters.city = place.city;
    understood.push({ field: "city", label: place.city });
  } else if (place.province) {
    filters.province = place.province;
    understood.push({ field: "province", label: place.province });
  }

  // Bedrooms
  const beds = parseBedrooms(t);
  if (beds !== null && beds > 0) {
    filters.minBedrooms = beds;
    understood.push({ field: "minBedrooms", label: `${beds}+ bedrooms` });
  }

  // Area (before prices, so "300 sqm" is not read as a budget)
  let rest = t;
  const area = rest.match(/(?:(at least|min(?:imum)?|over|above|around|about|approx(?:imately)?)\s+)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?:sqm|sq\.?\s*m|square\s*met(?:er|re)s?|m2)/);
  if (area) {
    const n = Number(area[2]!.replace(/,/g, ""));
    if (/around|about|approx/.test(area[1] ?? "")) {
      filters.minAreaSqm = Math.round(n * 0.75);
      filters.maxAreaSqm = Math.round(n * 1.25);
      understood.push({ field: "minAreaSqm", label: `About ${n.toLocaleString()} sqm` });
    } else {
      filters.minAreaSqm = n;
      understood.push({ field: "minAreaSqm", label: `${n.toLocaleString()}+ sqm` });
    }
    rest = rest.replace(area[0], " ");
  }
  rest = rest.replace(/\b\d{1,2}\s*-?\s*(?:br|bdr|bedrooms?)\b/g, " ");

  // Prices
  const between = rest.match(new RegExp(String.raw`(?:between|from)\s+${AMOUNT}\s*(?:and|to|-)\s*${AMOUNT}`));
  const range = between ?? rest.match(new RegExp(String.raw`${AMOUNT}\s*(?:-|to)\s*${AMOUNT}`));
  if (range) {
    const lo = amount(range[1]!, range[2] ?? range[4]);
    const hi = amount(range[3]!, range[4]);
    if (lo !== undefined && hi !== undefined && hi > lo) {
      filters.minPrice = lo;
      filters.maxPrice = hi;
    }
  } else {
    const max = rest.match(new RegExp(String.raw`(?:under|below|less than|max(?:imum)?|up to|within|budget(?: of| is)?|not more than|at most)\s+${AMOUNT}`));
    const min = rest.match(new RegExp(String.raw`(?:over|above|more than|at least|min(?:imum)?|starting)\s+${AMOUNT}`));
    if (max) filters.maxPrice = amount(max[1]!, max[2]);
    if (min) filters.minPrice = amount(min[1]!, min[2]);
    if (!max && !min) {
      // A lone amount with a unit ("8M", "60k") reads as a budget ceiling.
      const lone = rest.match(new RegExp(String.raw`(?:₱|php)?\s*(\d+(?:\.\d+)?)\s*(million|mil|m|k)\b`));
      if (lone) filters.maxPrice = amount(lone[1]!, lone[2]);
    }
  }
  if (filters.minPrice !== undefined) understood.push({ field: "minPrice", label: `From ${peso(filters.minPrice)}` });
  if (filters.maxPrice !== undefined) understood.push({ field: "maxPrice", label: `Up to ${peso(filters.maxPrice)}${filters.transactionType === "lease" ? "/mo" : ""}` });

  // Leftover words become keywords (building names, landmarks, features).
  const placeWords = new Set((place.matched ?? []).flatMap((m) => m.split(" ")));
  const kindWords = new Set(kind ? [...KINDS[kind]!.words, ...(KINDS[kind]!.cues ?? [])].flatMap((w) => normalizeText(w).split(" ")) : []);
  const words = normalizeText(rest)
    .split(" ")
    .filter((w) => w.length > 1 && !/^\d+(\.\d+)?(m|k|mil)?$/.test(w) && !FILLER.has(w) && !placeWords.has(w) && !kindWords.has(w) && !["condo", "condos", "lots", "houses", "commercial", "industrial", "agricultural", "residential"].includes(w));
  if (words.length) {
    filters.query = words.slice(0, 8).join(" ");
    understood.push({ field: "query", label: `“${filters.query}”` });
  }
  return { filters, understood };
}
