import { describe, expect, it } from "vitest";
import { analyzeListing, findFeatures, locationTier } from "@/lib/listings/analyze";
import { buyerCriteria, scoreListing, type MatchListing } from "@/lib/listings/match";

const base: MatchListing = {
  code: "X",
  transactionType: "sale",
  propertyType: "residential",
  kind: "condominium-unit",
  kindInferred: false,
  price: 15_000_000,
  city: "Makati",
  province: "Metro Manila",
  region: "NCR",
  locationTier: "cbd",
  bedrooms: 2,
  areaSqm: 80,
  pricePerSqm: 187_500,
  features: ["furnished", "parking"],
  purposes: { live: 1, rent_out: 0.9, business: 0.1, land_bank: 0.05, farm: 0 },
  quality: 1,
};
const crit = (o: object) => buyerCriteria.parse({ transactionType: "sale", ...o });

describe("listing analysis", () => {
  it("finds features, tiers and data gaps", () => {
    expect(findFeatures("Fully furnished 2BR with parking, near MRT, clean title")).toEqual(["furnished", "parking", "near_transit", "clean_title"]);
    expect(findFeatures("Semi-furnished studio")).toEqual(["semi_furnished"]);
    expect(locationTier("Edades Rockwell Makati", "Makati", "Metro Manila")).toBe("cbd");
    expect(locationTier("Kapitolyo", "Pasig", "Metro Manila")).toBe("metro");
    expect(locationTier("Imus", "Imus", "Cavite")).toBe("growth");
    const a = analyzeListing({ code: "A", name: "House in Lipa", notes: "", location: "Lipa", transactionType: "sale", propertyType: "residential", kind: "house-and-lot", kindInferred: true, price: 5e6, city: "Lipa", province: "Batangas", bedrooms: null, floorAreaSqm: null, lotAreaSqm: null });
    expect(a.region).toBe("South Luzon");
    expect(a.missing).toEqual(["property kind", "floor or lot area", "bedrooms", "features or description"]);
    expect(a.quality).toBe(0.2);
  });
});

describe("match score", () => {
  it("scores a perfect fit 10 and explains each criterion", () => {
    const m = scoreListing(crit({ kinds: ["condominium-unit"], city: "Makati", budgetMax: 16_000_000, minBedrooms: 2, features: ["parking"], purpose: "live" }), base);
    expect(m.score).toBe(10);
    expect(m.rating).toBe(10);
    expect(m.parts.map((p) => p.criterion)).toEqual(["kind", "location", "budget", "bedrooms", "features", "purpose"]);
    expect(m.confidence).toBe(1);
  });
  it("lowers the score with importance-weighted misses", () => {
    const m = scoreListing(crit({ kinds: ["condominium-unit"], city: "Taguig", budgetMax: 16_000_000, locationImportance: "nice" }), base);
    expect(m.score).toBeGreaterThan(7);
    expect(m.score).toBeLessThan(10);
    const strict = scoreListing(crit({ kinds: ["condominium-unit"], city: "Taguig", budgetMax: 16_000_000, locationImportance: "important" }), base);
    expect(strict.score).toBeLessThan(m.score);
  });
  it("excludes on a failed must-have, never on missing data", () => {
    expect(scoreListing(crit({ budgetMax: 10_000_000, budgetImportance: "must" }), base).excludedBy).toBe("budget");
    const unknownBeds = scoreListing(crit({ minBedrooms: 3, bedroomsImportance: "must" }), { ...base, bedrooms: null });
    expect(unknownBeds.excludedBy).toBeNull();
    expect(unknownBeds.confidence).toBe(0);
    expect(scoreListing(crit({}), { ...base, transactionType: "lease" }).excludedBy).not.toBeNull();
  });
  it("gives partial credit for nearby places and kind groups, and rewards value", () => {
    const near = scoreListing(crit({ city: "Taguig", province: "Metro Manila" }), base);
    expect(near.parts[0]!.fit).toBe(0.6);
    const group = scoreListing(crit({ kinds: ["any-residential"] }), base);
    expect(group.parts[0]!.fit).toBe(1);
    const value = scoreListing(crit({ budgetMax: 20e6 }), base, { "sale|condominium-unit|Metro Manila": 250_000 });
    expect(value.parts.find((p) => p.criterion === "value")?.fit).toBe(1);
  });
});
