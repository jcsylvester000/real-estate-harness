import { describe, expect, it } from "vitest";
import { parseInquiry } from "@/lib/listings/inquiry";
import { resolvePlace, resolvePlaceFuzzy } from "@/lib/listings/places";
import { parseAreaSqm, parseBedrooms } from "@/lib/listings/normalize";
import { kindFromText } from "@/lib/listings/kinds";

describe("places", () => {
  it("maps districts and landmarks to their city and province", () => {
    expect(resolvePlace("Pacific Plaza Fort Bonifacio Global City")).toMatchObject({ city: "Taguig", province: "Metro Manila" });
    expect(resolvePlace("SAN FERNANDO CITY, LA UNION")).toMatchObject({ city: "San Fernando (La Union)", province: "La Union" });
    expect(resolvePlace("Zinnia Towers 1211 EDSA Brgy Katipunan QC")).toMatchObject({ city: "Quezon City" });
    expect(resolvePlace("Concorde Village, Parañaque")).toMatchObject({ city: "Parañaque" });
    expect(resolvePlace("1634 Metro Manila")).toMatchObject({ city: null, province: "Metro Manila" });
    expect(resolvePlace("Calumpit, Bulacan")).toMatchObject({ city: "Calumpit", province: "Bulacan" });
  });
  it("corrects misspelt places", () => {
    expect(resolvePlaceFuzzy("makatti")).toMatchObject({ city: "Makati" });
    expect(resolvePlaceFuzzy("Paranake")).toMatchObject({ city: "Parañaque" });
  });
});

describe("listing name facts", () => {
  it("reads bedrooms, areas and kinds", () => {
    expect(parseBedrooms("Renaissance 2000 2BR For Sale")).toBe(2);
    expect(parseBedrooms("Smart Studio Living")).toBe(0);
    expect(parseAreaSqm("Prime 1,344 sqm Lot")).toBe(1344);
    expect(parseAreaSqm("Prime 20-Hectare Farm Lot")).toBe(200_000);
    expect(kindFromText("Prime Commercial Lot in Taguig")).toBe("commercial-lot");
    expect(kindFromText("Vacant lot", "commercial")).toBe("commercial-lot");
    expect(kindFromText("Office at Two Central Residences", "commercial")).toBe("office-space");
  });
});

describe("inquiry parser (no AI)", () => {
  it("turns a typical inquiry into filters", () => {
    const p = parseInquiry("2BR condo for rent in BGC under 60k");
    expect(p.filters).toEqual({ transactionType: "lease", kind: "condominium-unit", city: "Taguig", minBedrooms: 2, maxPrice: 60_000 });
    expect(p.understood.map((u) => u.label)).toEqual(["For rent", "Condominium unit", "Taguig", "2+ bedrooms", "Up to ₱60,000/mo"]);
  });
  it("handles ranges, areas, provinces and leftover keywords", () => {
    expect(parseInquiry("commercial lot near C6 between 50M and 700M").filters).toEqual({ kind: "commercial-lot", minPrice: 50_000_000, maxPrice: 700_000_000, query: "c6" });
    expect(parseInquiry("residential lot in La Union around 300 sqm").filters).toEqual({ kind: "residential-lot", province: "La Union", minAreaSqm: 225, maxAreaSqm: 375 });
    expect(parseInquiry("furnished unit in Rockwell for sale 15M").filters).toMatchObject({ transactionType: "sale", city: "Makati", maxPrice: 15_000_000, query: "furnished" });
    expect(parseInquiry("warehouse in Valenzuela for lease").filters).toEqual({ transactionType: "lease", kind: "warehouse", city: "Valenzuela" });
  });
});
