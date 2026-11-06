// Tools: the listings index. The model may recommend only listings these tools return.
// The harness ships with an in-memory demo backend (data/sample-listings.json); Grid Agentic plugs in the
// indexed Postgres listings database with setListingBackend().

import demoListings from "../sample-listings.json";
import { KIND_IDS, KINDS, PROPERTY_TYPES, TRANSACTION_TYPES } from "@/lib/listings/kinds";
import type { HarnessTool } from "./tool-types";

export interface ListingSearchInput {
  query?: string;
  transactionType?: "sale" | "lease";
  propertyType?: string;
  kind?: string;
  city?: string;
  province?: string;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minAreaSqm?: number;
  maxAreaSqm?: number;
  sort?: "relevance" | "price_asc" | "price_desc" | "newest";
  limit?: number;
}

/** What the tools return to the model: plain data, no uploader names or contact details. */
export interface ListingBackend {
  search(input: ListingSearchInput): Promise<{ total: number; matchMode?: string; listings: Record<string, unknown>[]; notes: string[]; applied?: unknown }>;
  index(): Promise<unknown>;
  get(code: string): Promise<Record<string, unknown> | null>;
}

/** Legacy shape of the bundled demo file. */
export interface Listing {
  id: string;
  title: string;
  city: string;
  area: string;
  propertyType: "condominium" | "house_and_lot" | "lot" | "commercial";
  bedrooms: number;
  bathrooms: number;
  floorAreaSqm: number | null;
  lotAreaSqm: number | null;
  price: number;
  status: "available" | "pre_selling" | "for_lease" | "reserved" | "sold";
  titleType: string;
  foreignEligible: boolean;
  notes: string;
}

const DEMO_KIND: Record<Listing["propertyType"], string> = { condominium: "condominium-unit", house_and_lot: "house-and-lot", lot: "residential-lot", commercial: "office-space" };
const demoView = (l: Listing) => ({
  code: l.id,
  name: l.title,
  transaction: l.status === "for_lease" ? "lease" : "sale",
  kind: KINDS[DEMO_KIND[l.propertyType]]!.label,
  [l.status === "for_lease" ? "monthlyRentPhp" : "pricePhp"]: l.price,
  location: `${l.area}, ${l.city}`,
  city: l.city,
  bedrooms: l.bedrooms,
  floorAreaSqm: l.floorAreaSqm,
  lotAreaSqm: l.lotAreaSqm,
  foreignEligible: l.foreignEligible,
});

/** Demo backend: simple filters over the 8 fictitious sample listings. */
export const demoBackend: ListingBackend = {
  async search(input) {
    const all = demoListings as Listing[];
    const wantLease = input.transactionType === "lease";
    const m = all.filter(
      (l) =>
        (wantLease ? l.status === "for_lease" : ["available", "pre_selling"].includes(l.status)) &&
        (!input.city || `${l.city} ${l.area}`.toLowerCase().includes(input.city.toLowerCase())) &&
        (!input.kind || DEMO_KIND[l.propertyType] === input.kind) &&
        (input.minPrice === undefined || l.price >= input.minPrice) &&
        (input.maxPrice === undefined || l.price <= input.maxPrice) &&
        (input.minBedrooms === undefined || l.bedrooms >= input.minBedrooms) &&
        (!input.query || `${l.title} ${l.notes} ${l.area}`.toLowerCase().includes(input.query.toLowerCase())),
    );
    const listings = m.sort((a, b) => a.price - b.price).slice(0, input.limit ?? 5).map(demoView);
    return { total: m.length, listings, notes: m.length ? [] : ["No matching listings in inventory. Do not invent listings; suggest widening the search."] };
  },
  async index() {
    return { totalAvailable: (demoListings as Listing[]).length, note: "Demo inventory (8 fictitious listings)." };
  },
  async get(code) {
    const l = (demoListings as Listing[]).find((x) => x.id === code);
    return l ? { ...demoView(l), notes: l.notes } : null;
  },
};

let backend: ListingBackend = demoBackend;

/** Plug in the real inventory (Grid Agentic: the indexed listings database). */
export function setListingBackend(b: ListingBackend): void {
  backend = b;
}

export const searchListings = (input: ListingSearchInput) => backend.search(input);

export const searchListingsTool: HarnessTool<ListingSearchInput> = {
  definition: {
    name: "search_listings",
    description:
      "Search GRID's listings index, the only inventory you may recommend. Turn the client's inquiry into filters (transaction, kind, place, budget, bedrooms, size) and put remaining specifics (building or village names, landmarks, 'furnished', 'corner', 'near C5') in query. Prices are the sale price, or the monthly rent for leases, in PHP. Returns the total number of matches, the best matches, and notes on any widening or spelling correction. If unsure which places or kinds exist, call get_listing_index first.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords not covered by filters, e.g. 'Rockwell furnished' or 'near C6'" },
        transactionType: { type: "string", enum: [...TRANSACTION_TYPES], description: "sale, or lease (rent)" },
        propertyType: { type: "string", enum: [...PROPERTY_TYPES], description: "Broad type; prefer kind when the client named one" },
        kind: { type: "string", enum: KIND_IDS, description: "Specific kind, e.g. condominium-unit, house-and-lot, residential-lot, office-space, warehouse" },
        city: { type: "string", description: "City, district or landmark (e.g. Makati, BGC, Alabang, Ortigas)" },
        province: { type: "string", description: "Province or 'Metro Manila' (e.g. La Union, Cavite, Rizal)" },
        minPrice: { type: "number", description: "Minimum price, or monthly rent for leases, in PHP" },
        maxPrice: { type: "number", description: "Maximum price, or monthly rent for leases, in PHP" },
        minBedrooms: { type: "integer", minimum: 0, description: "0 = studio" },
        minAreaSqm: { type: "number", description: "Minimum floor or lot area in sqm" },
        maxAreaSqm: { type: "number", description: "Maximum floor or lot area in sqm" },
        sort: { type: "string", enum: ["relevance", "price_asc", "price_desc", "newest"] },
        limit: { type: "integer", minimum: 1, maximum: 10, description: "How many listings to return (default 5)" },
      },
    },
  },
  run: (input) => backend.search({ ...input, limit: Math.min(input.limit ?? 5, 10) }),
};

export const getListingIndexTool: HarnessTool<Record<string, never>> = {
  definition: {
    name: "get_listing_index",
    description:
      "Summary of the listings index: how many listings are available by transaction, type, kind, province and top cities, plus a price guide (min, median, max) per transaction and type. Use it to map the client's words to valid filters, to say what GRID has when a search finds nothing, and to sanity-check budgets.",
    parameters: { type: "object", properties: {} },
  },
  run: () => backend.index(),
};

export const getListingTool: HarnessTool<{ code: string }> = {
  definition: {
    name: "get_listing",
    description: "Full details of one listing by its code (from search_listings).",
    parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
  },
  run: async ({ code }) => (await backend.get(code)) ?? { error: `No listing with code ${code}.` },
};
