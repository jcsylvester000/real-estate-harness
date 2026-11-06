// Tool: search the brokerage's own inventory. The model may only recommend listings returned here.
// Ships with demo data in `lib/harness/sample-listings.json`; swap `setListingSource` for a database.

import demoListings from "../sample-listings.json";
import type { HarnessTool } from "./tool-types";

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

export interface ListingSearchInput {
  city?: string;
  propertyType?: Listing["propertyType"];
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  forLease?: boolean;
  foreignEligibleOnly?: boolean;
  limit?: number;
}

/** Receives the search input so a database loader can pre-filter; the tool still applies every filter itself. */
type ListingSource = (input: ListingSearchInput) => Listing[] | Promise<Listing[]>;

let source: ListingSource = () => demoListings as Listing[];

/** Replace the demo inventory with your own loader (database, CRM API, spreadsheet export). */
export function setListingSource(loader: ListingSource): void {
  source = loader;
}

export async function searchListings(input: ListingSearchInput) {
  const all = await source(input);
  const wantedStatus = input.forLease ? ["for_lease"] : ["available", "pre_selling"];
  const matches = all.filter(l =>
    wantedStatus.includes(l.status) &&
    (!input.city || l.city.toLowerCase().includes(input.city.toLowerCase()) || l.area.toLowerCase().includes(input.city.toLowerCase())) &&
    (!input.propertyType || l.propertyType === input.propertyType) &&
    (input.minPrice === undefined || l.price >= input.minPrice) &&
    (input.maxPrice === undefined || l.price <= input.maxPrice) &&
    (input.minBedrooms === undefined || l.bedrooms >= input.minBedrooms) &&
    (!input.foreignEligibleOnly || l.foreignEligible));
  return {
    count: matches.length,
    listings: matches.sort((a, b) => a.price - b.price).slice(0, input.limit ?? 5),
    note: matches.length === 0 ? "No matching listings in inventory. Do not invent listings; suggest widening the search." : undefined,
  };
}

export const searchListingsTool: HarnessTool<ListingSearchInput> = {
  definition: {
    name: "search_listings",
    description: "Search the brokerage's own property inventory. Only recommend listings returned by this tool; never invent listings.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City or area name, e.g. Pasig, BGC, Cebu City" },
        propertyType: { type: "string", enum: ["condominium", "house_and_lot", "lot", "commercial"] },
        minPrice: { type: "number", description: "Minimum price (or monthly rent if forLease) in PHP" },
        maxPrice: { type: "number", description: "Maximum price (or monthly rent if forLease) in PHP" },
        minBedrooms: { type: "integer", description: "Minimum bedrooms (0 = studio)", minimum: 0 },
        forLease: { type: "boolean", description: "Search rentals instead of sales" },
        foreignEligibleOnly: { type: "boolean", description: "Only units a foreign buyer may purchase" },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
    },
  },
  run: searchListings,
};
