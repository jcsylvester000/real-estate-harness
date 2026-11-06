import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { BUILTIN_APPS, type AppInfo } from "@/lib/apps/catalog";
import { DEFAULT_TOOLS, ToolRegistry } from "@/lib/harness";
import { importGridCsv } from "@/lib/listings/import";
import { facets, searchListings } from "@/lib/listings/search";
import { callDriver, type Actor } from "@/lib/server/drivers";
import { createUser, type PublicUser } from "@/lib/server/services/auth";
import { freshDb } from "../helpers/db";
import { freshListingsDb } from "../helpers/listings-db";
import type { ListingsDB } from "@/lib/listings/db";

const csv = readFileSync(`${process.cwd()}/tests/fixtures/grid-listings-sample.csv`, "utf8");
let db: ListingsDB;
let broker: PublicUser;
let sales: PublicUser;
const app = (id: string) => BUILTIN_APPS.find((a) => a.id === id)!;
const as = (user: PublicUser, a: AppInfo): Actor => ({ user, sessionId: "t", app: a });

beforeAll(async () => {
  await freshDb();
  db = await freshListingsDb();
  broker = await createUser({ username: "broker1", password: "correct horse battery staple grid", role: "broker" });
  sales = await createUser({ username: "sales9", password: "correct horse battery staple grid", role: "salesperson" });
});

describe("listings database", () => {
  it("imports a GRID export, skips bad rows, and re-imports as updates", async () => {
    const first = await importGridCsv(db, { fileName: "sample.csv", csv });
    expect(first).toMatchObject({ rowsTotal: 9, inserted: 8, updated: 0, skipped: 1 });
    expect(first.problems[0]).toMatchObject({ row: 10, code: "TEST_0009" });
    const again = await importGridCsv(db, { fileName: "sample.csv", csv });
    expect(again).toMatchObject({ inserted: 0, updated: 8 });
  });

  it("indexes place, kind and facts from free text", async () => {
    const r = await searchListings(db, { query: "Avida" });
    expect(r.listings[0]).toMatchObject({ code: "TEST_0003", city: "Taguig", province: "Metro Manila", kind: "condominium-unit", kindInferred: true, bedrooms: 1 });
    const lot = await searchListings(db, { province: "La Union" });
    expect(lot.listings[0]).toMatchObject({ code: "TEST_0005", lotAreaSqm: 79 });
  });

  it("filters by place alias, kind, transaction and budget; hides inactive listings", async () => {
    const bgc = await searchListings(db, { city: "BGC", transactionType: "lease", kind: "condominium-unit", maxPrice: 40_000 });
    expect(bgc.listings.map((l) => l.code)).toEqual(["TEST_0002", "TEST_0003"]);
    const makati = await searchListings(db, { city: "Makati", kind: "condominium-unit" });
    expect(makati.listings.map((l) => l.code)).toEqual(["TEST_0004"]);
  });

  it("ranks keyword matches, falls back to partial matches, and corrects place spelling", async () => {
    expect((await searchListings(db, { query: "commercial lot C6" })).listings[0]?.code).toBe("TEST_0001");
    const partial = await searchListings(db, { query: "rockwell penthouse" });
    expect(partial.matchMode).toBe("partial");
    expect(partial.listings[0]?.code).toBe("TEST_0004");
    const typo = await searchListings(db, { query: "paranake house" });
    expect(typo.notes[0]).toMatch(/paranake → paranaque/);
    expect(typo.listings[0]?.code).toBe("TEST_0006");
  });

  it("builds facets for the AI index", async () => {
    const f = await facets(db);
    expect(f.totalAvailable).toBe(7);
    expect(f.byCity.find((c) => c.city === "Taguig")?.count).toBe(3);
    expect(f.byKind.find((k) => k.value === "warehouse")?.count).toBe(1);
  });
});

describe("listings drivers and AI tools", () => {
  it("answers a plain-language inquiry without AI", async () => {
    const r = (await callDriver(as(sales, app("listings")), "listings.ask", { text: "condo for rent in BGC under 40k" })) as { parsed: { filters: object }; result: { listings: { code: string }[] } };
    expect(r.parsed.filters).toEqual({ transactionType: "lease", kind: "condominium-unit", city: "Taguig", maxPrice: 40_000 });
    expect(r.result.listings.map((l) => l.code)).toEqual(["TEST_0002", "TEST_0003"]);
  });

  it("never gives the AI uploader names or emails; shows contacts only to brokers in built-in apps", async () => {
    const tools = new ToolRegistry(DEFAULT_TOOLS);
    await import("@/lib/server/services/listings");
    const out = JSON.stringify((await tools.execute("search_listings", { city: "Taguig" })).result);
    expect(out).toContain("TEST_0001");
    expect(out).not.toMatch(/example\.com|Test Broker/);
    const idx = JSON.stringify((await tools.execute("get_listing_index", {})).result);
    expect(idx).toContain("Taguig");
    expect(JSON.stringify((await tools.execute("get_listing", { code: "TEST_0001" })).result)).not.toMatch(/example\.com|Test Broker/);
    const forBroker = (await callDriver(as(broker, app("listings")), "listings.get", { code: "TEST_0001" })) as { listedByEmail?: string };
    expect(forBroker.listedByEmail).toBe("broker.a@example.com");
    const forSales = (await callDriver(as(sales, app("listings")), "listings.get", { code: "TEST_0001" })) as { listedByEmail?: string };
    expect(forSales.listedByEmail).toBeUndefined();
  });

  it("lets brokers add, edit and delete listings and import CSVs; salespersons cannot", async () => {
    const form = { name: "Corner 2BR at Salcedo Village", transactionType: "sale", propertyType: "residential", propertySubType: "condominium-unit", price: 18_500_000, location: "Salcedo Village", bedrooms: 2 };
    const saved = (await callDriver(as(broker, app("listings")), "listings.save", form)) as { code: string; city: string };
    expect(saved).toMatchObject({ city: "Makati" });
    expect(saved.code).toMatch(/^GRID-M-/);
    expect(((await searchListings(db, { query: "salcedo corner" })).listings[0])?.code).toBe(saved.code);
    await expect(callDriver(as(sales, app("listings")), "listings.save", form)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(callDriver(as(sales, app("listings")), "listings.import", { fileName: "x.csv", csv })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(callDriver(as(broker, app("listings")), "listings.import", { fileName: "x.csv", csv: "a,b\n1,2" })).rejects.toMatchObject({ code: "invalid_input" });
    expect(await callDriver(as(broker, app("listings")), "listings.delete", { code: saved.code })).toBe(true);
  });
});

describe("sorting", () => {
  it("accepts every sort with and without keywords", async () => {
    for (const sort of ["relevance", "price_asc", "price_desc", "newest"] as const) {
      expect((await searchListings(db, { sort })).total).toBeGreaterThan(0);
      expect((await searchListings(db, { sort, query: "condo" })).total).toBeGreaterThan(0);
    }
  });
});
