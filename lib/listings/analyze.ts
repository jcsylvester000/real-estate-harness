/**
 * Listing analysis: breaks a listing into the facts Buyer–Seller Matching scores on.
 * Runs in the projector whenever a listing is imported, saved or edited, and its result is stored in the
 * read model (listing_search.analysis / features / quality), so matching never re-parses text.
 *
 * Output: region, location tier, size, price per sqm, features found in the name and notes, the purposes the
 * property suits, and a data-quality score (how much the match can rely on).
 */
import { KINDS } from "./kinds";
import { normalizeText } from "./normalize";

// -- Regions and location tiers --

const REGION_OF: Record<string, string> = {
  "Metro Manila": "NCR",
  "La Union": "North Luzon", "Ilocos Sur": "North Luzon", "Ilocos Norte": "North Luzon", Pangasinan: "North Luzon", Benguet: "North Luzon", Kalinga: "North Luzon", "Nueva Vizcaya": "North Luzon", Isabela: "North Luzon", Cagayan: "North Luzon",
  Bulacan: "Central Luzon", Pampanga: "Central Luzon", Tarlac: "Central Luzon", "Nueva Ecija": "Central Luzon", Zambales: "Central Luzon", Bataan: "Central Luzon", Aurora: "Central Luzon",
  Cavite: "South Luzon", Laguna: "South Luzon", Batangas: "South Luzon", Rizal: "South Luzon", Quezon: "South Luzon",
  "Oriental Mindoro": "South Luzon", "Occidental Mindoro": "South Luzon", Palawan: "South Luzon", Albay: "South Luzon", "Camarines Sur": "South Luzon", "Camarines Norte": "South Luzon",
  Cebu: "Visayas", Bohol: "Visayas", Aklan: "Visayas", Iloilo: "Visayas", "Negros Occidental": "Visayas", "Negros Oriental": "Visayas", Leyte: "Visayas",
  "Misamis Oriental": "Mindanao", "Davao del Sur": "Mindanao", "Zamboanga del Sur": "Mindanao", "South Cotabato": "Mindanao", "Surigao del Norte": "Mindanao",
};
export const REGIONS = ["NCR", "North Luzon", "Central Luzon", "South Luzon", "Visayas", "Mindanao"] as const;
export const regionOf = (province: string | null) => (province ? (REGION_OF[province] ?? null) : null);

/** Central business districts: prime demand for offices, condos and rentals. */
const CBD_PHRASES = [
  "makati cbd", "ayala avenue", "ayala ave", "salcedo", "legaspi village", "paseo de roxas", "rockwell", "greenbelt", "glorietta",
  "bgc", "bonifacio global city", "fort bonifacio", "uptown bonifacio", "high street", "mckinley",
  "ortigas center", "ortigas", "capitol commons", "emerald avenue", "adb avenue",
  "alabang", "filinvest city", "madrigal business park", "eastwood", "araneta city", "cubao",
  "bay area", "aseana", "entertainment city", "mall of asia", "moa", "newport", "arca south",
  "cebu business park", "cebu it park", "nuvali", "clark freeport",
];
/** Fast-growing cities and provinces around Metro Manila and regional centres. */
const GROWTH = new Set([
  "Cavite", "Laguna", "Bulacan", "Rizal", "Pampanga", "Batangas", "Cebu",
  "Davao City", "Cagayan de Oro", "Iloilo City", "Bacolod", "Baguio", "Tagaytay", "Clark", "Angeles", "Santa Rosa", "Lipa", "Antipolo",
]);

export type LocationTier = "cbd" | "metro" | "growth" | "provincial" | "unknown";
export const TIER_LABEL: Record<LocationTier, string> = { cbd: "Business district", metro: "Metro Manila", growth: "Growth area", provincial: "Provincial", unknown: "Not stated" };

export function locationTier(placeText: string, city: string | null, province: string | null): LocationTier {
  const t = ` ${normalizeText(placeText)} `;
  if (CBD_PHRASES.some((p) => t.includes(` ${p} `))) return "cbd";
  if (province === "Metro Manila") return "metro";
  if ((city && GROWTH.has(city)) || (province && GROWTH.has(province))) return "growth";
  if (province) return "provincial";
  return "unknown";
}

// -- Feature lexicon (what buyers ask for; found in listing names and notes) --

export const FEATURES: Record<string, { label: string; phrases: string[] }> = {
  furnished: { label: "Furnished", phrases: ["fully furnished", "furnished", "ff"] },
  semi_furnished: { label: "Semi-furnished", phrases: ["semi furnished", "semi-furnished", "sf"] },
  unfurnished: { label: "Unfurnished", phrases: ["unfurnished", "bare"] },
  parking: { label: "With parking", phrases: ["parking", "with parking", "garage", "carport", "parking slot"] },
  corner: { label: "Corner unit or lot", phrases: ["corner"] },
  view: { label: "View", phrases: ["view", "city view", "sea view", "bay view", "golf view", "skyline", "overlooking", "panoramic"] },
  balcony: { label: "Balcony", phrases: ["balcony", "terrace", "lanai"] },
  pool: { label: "Pool", phrases: ["pool", "swimming pool"] },
  amenities: { label: "Amenities (gym, clubhouse)", phrases: ["gym", "clubhouse", "amenities", "fitness"] },
  near_transit: { label: "Near train/transit", phrases: ["mrt", "lrt", "station", "near train", "transport hub", "bus terminal", "edsa", "c5", "c6", "skyway", "slex", "nlex", "cavitex", "tplex"] },
  near_mall: { label: "Near malls", phrases: ["mall", "sm ", "ayala malls", "robinsons", "market market", "high street", "greenbelt", "glorietta", "megamall"] },
  near_school: { label: "Near schools", phrases: ["school", "university", "college", "ateneo", "la salle", "up diliman", "ust", "dlsu"] },
  gated: { label: "Gated village", phrases: ["village", "subdivision", "gated", "exclusive village", "estate", "enclave"] },
  ready: { label: "Ready for occupancy", phrases: ["rfo", "ready for occupancy", "move in ready", "turnover ready", "brand new", "newly renovated", "renovated"] },
  pre_selling: { label: "Pre-selling", phrases: ["pre selling", "pre-selling", "preselling", "turnover 202", "turnover 203"] },
  tenanted: { label: "With tenant / rental income", phrases: ["with tenant", "tenanted", "income generating", "rental income", "with lease", "currently leased", "existing tenant"] },
  clean_title: { label: "Clean title", phrases: ["clean title", "titled", "tct", "cct", "with title"] },
  road_frontage: { label: "Road frontage", phrases: ["frontage", "along", "main road", "highway", "national road", "avenue", "corner lot"] },
  commercial_use: { label: "Commercial use allowed", phrases: ["commercial", "mixed use", "mixed-use", "business", "zoned commercial", "office", "retail"] },
  beachfront: { label: "Beachfront", phrases: ["beachfront", "beach front", "beach", "seaside", "shoreline"] },
  development: { label: "Development potential", phrases: ["development", "redevelopment", "land bank", "landbanking", "subdivision potential", "high density"] },
  motivated: { label: "Motivated seller", phrases: ["urgent sale", "fire sale", "must sell", "below market", "price drop", "reduced", "distressed", "bargain"] },
  pet_friendly: { label: "Pet-friendly", phrases: ["pet friendly", "pet-friendly"] },
};
export const FEATURE_IDS = Object.keys(FEATURES);

/** Feature ids found in a text (accent-free word match). */
export function findFeatures(text: string): string[] {
  const t = ` ${normalizeText(text)} `;
  const found = FEATURE_IDS.filter((id) => FEATURES[id]!.phrases.some((p) => t.includes(` ${normalizeText(p)} `)));
  // "semi-furnished" also contains "furnished": keep only the more specific one.
  return found.includes("semi_furnished") ? found.filter((f) => f !== "furnished") : found;
}

// -- Purposes --

export const PURPOSES = {
  live: "Live in",
  rent_out: "Rent out / investment",
  business: "Business use",
  land_bank: "Land banking / development",
  farm: "Farming or agri-business",
} as const;
export type Purpose = keyof typeof PURPOSES;

/** 0-1 fit of a listing for each buyer purpose. */
function purposeFit(kind: string, propertyType: string, tier: LocationTier, features: string[]): Record<Purpose, number> {
  const residential = propertyType === "residential" || ["condominium-unit", "house-and-lot", "townhouse", "apartment"].includes(kind);
  const lot = kind.endsWith("-lot") || propertyType === "land";
  const commercial = propertyType === "commercial" || propertyType === "industrial";
  const prime = tier === "cbd" ? 1 : tier === "metro" ? 0.8 : tier === "growth" ? 0.6 : 0.4;
  return {
    live: residential ? 1 : kind === "residential-lot" || kind === "subdivision-lot" ? 0.6 : 0.1,
    rent_out: Math.min(1, (kind === "condominium-unit" || kind === "apartment" || kind === "office-space" || kind === "retail-space" ? 0.6 : residential ? 0.4 : 0.2) + prime * 0.3 + (features.includes("tenanted") ? 0.3 : 0) + (features.includes("furnished") ? 0.1 : 0)),
    business: commercial ? 1 : features.includes("commercial_use") ? 0.7 : features.includes("road_frontage") ? 0.4 : 0.1,
    land_bank: lot ? Math.min(1, 0.7 + (features.includes("development") ? 0.2 : 0) + (tier === "growth" ? 0.1 : 0)) : features.includes("development") ? 0.5 : 0.05,
    farm: propertyType === "agricultural" || kind === "farm-lot" ? 1 : lot && tier === "provincial" ? 0.4 : 0,
  };
}

// -- Analysis --

export interface ListingFacts {
  code: string;
  name: string;
  notes: string;
  location: string;
  transactionType: string;
  propertyType: string;
  kind: string;
  kindInferred: boolean;
  price: number;
  city: string | null;
  province: string | null;
  bedrooms: number | null;
  floorAreaSqm: number | null;
  lotAreaSqm: number | null;
}

export interface ListingAnalysis {
  region: string | null;
  locationTier: LocationTier;
  areaSqm: number | null;
  pricePerSqm: number | null;
  features: string[];
  purposes: Record<Purpose, number>;
  /** 0-1: share of matching facts the listing actually states. */
  quality: number;
  missing: string[];
  summary: string;
}

export function analyzeListing(l: ListingFacts): ListingAnalysis {
  const region = regionOf(l.province);
  const tier = locationTier(`${l.location} ${l.name}`, l.city, l.province);
  const areaSqm = l.floorAreaSqm ?? l.lotAreaSqm ?? null;
  const pricePerSqm = areaSqm && areaSqm > 0 && l.transactionType === "sale" ? Math.round(l.price / areaSqm) : areaSqm && areaSqm > 0 ? Math.round((l.price / areaSqm) * 100) / 100 : null;
  const features = findFeatures(`${l.name} ${l.notes}`);
  const residentialUnit = ["condominium-unit", "house-and-lot", "townhouse", "apartment"].includes(l.kind);
  const checks: [boolean, string][] = [
    [!!l.kind && !l.kindInferred, "property kind"],
    [!!l.city, "city"],
    [areaSqm !== null, "floor or lot area"],
    [!residentialUnit || l.bedrooms !== null, "bedrooms"],
    [l.notes.trim().length > 20 || features.length > 0, "features or description"],
  ];
  const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);
  const quality = Math.round(((checks.length - missing.length) / checks.length) * 100) / 100;
  const kindLabel = KINDS[l.kind]?.label ?? "Property";
  const summary = [
    `${kindLabel}${l.kindInferred ? " (kind guessed from the name)" : ""} for ${l.transactionType === "lease" ? "rent" : "sale"}`,
    [l.city, l.province].filter(Boolean).join(", ") || "location not stated",
    TIER_LABEL[tier].toLowerCase(),
    areaSqm ? `${areaSqm.toLocaleString()} sqm${pricePerSqm ? ` (₱${pricePerSqm.toLocaleString()}/sqm${l.transactionType === "lease" ? "/mo" : ""})` : ""}` : null,
    l.bedrooms !== null ? (l.bedrooms === 0 ? "studio" : `${l.bedrooms} BR`) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { region, locationTier: tier, areaSqm, pricePerSqm, features, purposes: purposeFit(l.kind, l.propertyType, tier, features), quality, missing, summary };
}
