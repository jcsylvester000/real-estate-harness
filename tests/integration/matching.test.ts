import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { BUILTIN_APPS } from "@/lib/apps/catalog";
import { buyersForListing, deleteBuyer, listBuyers, matchesForBuyer, matchNow, saveBuyer } from "@/lib/listings/buyers";
import { importGridCsv } from "@/lib/listings/import";
import { saveListing } from "@/lib/listings/manage";
import { buyerCriteria } from "@/lib/listings/match";
import { getListing, searchListings } from "@/lib/listings/search";
import { callDriver } from "@/lib/server/drivers";
import { createUser } from "@/lib/server/services/auth";
import { freshDb } from "../helpers/db";
import { freshListingsDb } from "../helpers/listings-db";

const csv = readFileSync(`${process.cwd()}/tests/fixtures/grid-listings-sample.csv`, "utf8");
const bgcRenter = buyerCriteria.parse({ transactionType: "lease", kinds: ["condominium-unit"], city: "Taguig", budgetMax: 40_000, minScore: 6 });

beforeAll(async () => {
  await freshDb();
  await freshListingsDb();
  await importGridCsv({ fileName: "sample.csv", csv });
});

describe("CQRS read side", () => {
  it("serves listing analysis from the read model", async () => {
    const l = await getListing("TEST_0004");
    expect(l?.analysis).toMatchObject({ region: "NCR", locationTier: "cbd" });
    expect(l?.features).toContain("furnished");
  });
  it("reads its own writes: a saved listing is searchable and analysed at once", async () => {
    const saved = await saveListing({ name: "Furnished 1BR near MRT with parking", transactionType: "lease", propertyType: "residential", propertySubType: "condominium-unit", price: 38_000, location: "Uptown Bonifacio, Taguig", availability: "available", bedrooms: 1, bathrooms: 1, floorAreaSqm: 45, lotAreaSqm: null, titleType: "", foreignEligible: null, notes: "" }, { displayName: "Test", role: "broker" });
    expect(saved.features).toEqual(expect.arrayContaining(["furnished", "parking", "near_transit"]));
    expect((await searchListings({ query: "uptown" })).listings[0]?.code).toBe(saved.code);
  });
});

describe("buyer–seller matching", () => {
  it("scores listings live, best first, with a breakdown", async () => {
    const r = await matchNow(bgcRenter);
    expect(r.results.length).toBeGreaterThanOrEqual(2);
    expect(r.results.every((x) => x.match.score >= 6)).toBe(true);
    expect(r.results[0]!.listing.city).toBe("Taguig");
    expect(r.results[0]!.match.parts.find((p) => p.criterion === "budget")?.fit).toBe(1);
  });
  it("keeps saved buyers matched both ways as listings and buyers change", async () => {
    const id = await saveBuyer({ label: "BGC renter, 1-2BR", notes: "", criteria: bgcRenter });
    const mine = await matchesForBuyer(id);
    expect(mine!.total).toBeGreaterThanOrEqual(2);
    const code = mine!.results[0]!.listing.code;
    expect((await buyersForListing(code)).map((b) => b.id)).toContain(id);
    expect((await listBuyers()).find((b) => b.id === id)?.matches).toBe(mine!.total);
    // A new matching listing appears in the buyer's matches without re-saving the buyer.
    const added = await saveListing({ name: "Studio near High Street", transactionType: "lease", propertyType: "residential", propertySubType: "condominium-unit", price: 30_000, location: "BGC, Taguig", availability: "available", bedrooms: 0, bathrooms: 1, floorAreaSqm: 30, lotAreaSqm: null, titleType: "", foreignEligible: null, notes: "" }, { displayName: "T", role: "broker" });
    expect((await matchesForBuyer(id))!.results.map((r) => r.listing.code)).toContain(added.code);
    await deleteBuyer(id);
    expect(await buyersForListing(code)).toEqual([]);
  });
  it("is available to built-in apps through the driver gate", async () => {
    const user = await createUser({ username: "matcher", password: "correct horse battery staple grid", role: "salesperson" });
    const app = BUILTIN_APPS.find((a) => a.id === "buyer-match")!;
    const r = (await callDriver({ user, sessionId: "s", app }, "match.run", { criteria: bgcRenter })) as { total: number };
    expect(r.total).toBeGreaterThanOrEqual(2);
  });
});
