import { describe, expect, it } from "vitest";
import { findAmenities } from "@/lib/teaser/amenities";
import { cleanText, writeCopy } from "@/lib/teaser/copy";
import { boundText, color, factsText, hexAlpha, priceText } from "@/lib/teaser/format";
import { ICONS } from "@/lib/teaser/icons";
import { applyGenerators, DECK_TEMPLATES, newDoc, TEMPLATES, TRAILER_TEMPLATES } from "@/lib/teaser/templates";
import { emptyProperty } from "@/lib/teaser/types";
import { isPrivateAddress } from "@/lib/server/services/teasers";

const RAW = `🔥 FOR SALE!!! BRAND NEW 4BR HOUSE AND LOT IN ALABANG 🔥
Corner lot, 450 sqm lot area, 320 sqm floor area, 2-car garage, 3 T&B. Inside an exclusive gated village with 24/7 security, clubhouse and swimming pool.
✓ Walking distance to schools and Festival Mall
✓ Clean title
Price: ₱28.5M negotiable. PM me for details or call 0917 123 4567. www.example.com #alabang`;

describe("no-AI copywriter", () => {
  const r = writeCopy(RAW);
  it("cleans shouting, emojis, phone numbers, links and hashtags", () => {
    const { text, removed } = cleanText(RAW);
    expect(text).not.toMatch(/0917|www\.|#alabang|🔥/);
    expect(text).toContain("Brand new 4BR house and lot in Alabang");
    expect(removed).toEqual(expect.arrayContaining(["1 phone number", "1 link"]));
  });
  it("finds the facts", () => {
    expect(r.facts).toMatchObject({ bedrooms: 4, bathrooms: 3, lotArea: 450, floorArea: 320, parking: 2, price: 28_500_000, transaction: "sale", kind: "House and lot", location: "Alabang" });
  });
  it("writes taglines, a short description without the price, highlights and amenities", () => {
    expect(r.taglines[0]).toBe("Corner 4-bedroom house in Alabang");
    expect(r.taglines.length).toBeGreaterThanOrEqual(4);
    expect(r.short.split(/\s+/).length).toBeLessThanOrEqual(61);
    expect(r.short).not.toMatch(/₱|0917/);
    expect(r.highlights).toEqual(expect.arrayContaining(["Walking distance to schools and Festival Mall", "Clean title"]));
    expect(r.amenities).toEqual(expect.arrayContaining(["pool", "clubhouse", "security", "gated", "near_school", "near_mall", "clean_title", "corner"]));
  });
  it("writes from facts when there is no text", () => {
    const x = writeCopy("", { kind: "Condominium unit", bedrooms: 2, location: "BGC, Taguig", amenities: ["pool", "gym"], floorArea: 68 });
    expect(x.short).toBe("A 2-bedroom condominium unit in BGC, Taguig with swimming pool and fitness gym. 68 sqm of living space.");
  });
  it("spots amenities in plain words", () => {
    expect(findAmenities("semi furnished unit near MRT with gym")).toEqual(expect.arrayContaining(["semi_furnished", "near_transit", "gym"]));
    expect(findAmenities("semi furnished")).not.toContain("furnished");
  });
});

describe("templates", () => {
  it("has 20 decks and 10 trailers with unique ids", () => {
    expect(DECK_TEMPLATES).toHaveLength(20);
    expect(TRAILER_TEMPLATES).toHaveLength(10);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(30);
  });
  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s builds valid slides", (_id, t) => {
    const doc = newDoc(t, { property: { ...emptyProperty(), name: "Test", amenities: ["pool", "gym", "security"], highlights: ["A", "B"], bedrooms: 2, floorArea: 60, photos: ["asset:x"] } });
    expect(doc.width).toBe(t.vertical ? 1080 : 1920);
    expect(doc.slides.length).toBeGreaterThanOrEqual(6);
    for (const s of doc.slides) {
      for (const e of s.elements) {
        expect(Number.isFinite(e.x + e.y + e.w + e.h)).toBe(true);
        if (e.type === "icon") expect(ICONS[e.icon]).toBeDefined();
        if (e.type === "text" && e.bind) expect(boundText(e.bind, doc, true)).not.toBeNull();
      }
    }
    if (t.kind === "trailer") expect(doc.slides.reduce((n, s) => n + s.duration, 0)).toBeGreaterThan(12);
    const ids = doc.slides.flatMap((s) => s.elements.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("regenerates amenity, highlight and fact lists from the details", () => {
    const doc = newDoc(DECK_TEMPLATES[0]!);
    const am = doc.slides.find((s) => s.role === "amenities")!;
    expect(am.elements.some((e) => e.name === "hint")).toBe(true);
    const next = applyGenerators({ ...doc, property: { ...doc.property, amenities: ["pool", "gym", "spa"], lotArea: 300 } });
    const am2 = next.slides.find((s) => s.role === "amenities")!;
    expect(am2.elements.filter((e) => e.type === "icon" && e.auto)).toHaveLength(3);
    const ov = next.slides.find((s) => s.role === "overview")!;
    expect(ov.elements.some((e) => e.type === "text" && e.bind === "property.lotN")).toBe(true);
  });
});

describe("brand tokens and values", () => {
  const brand = newDoc(DECK_TEMPLATES[0]!).brand;
  it("resolves colour tokens with strength", () => {
    expect(color("$primary", brand)).toBe("#0e192f");
    expect(color("$accent/50", brand)).toBe("rgba(190,133,98,0.5)");
    expect(hexAlpha("$accent/50", brand)).toEqual({ hex: "be8562", alpha: 0.5 });
  });
  it("formats price and facts", () => {
    const p = { ...emptyProperty(), price: 28_500_000, bedrooms: 3, bathrooms: 2, floorArea: 120 };
    expect(priceText(p)).toBe("₱28.5M");
    expect(priceText({ ...p, transaction: "lease", price: 45_000 })).toBe("₱45,000 / month");
    expect(factsText(p)).toBe("3 Bedrooms  ·  2 Baths  ·  120 sqm");
  });
});

describe("web import safety", () => {
  it.each([["127.0.0.1"], ["10.1.2.3"], ["192.168.1.10"], ["172.20.0.1"], ["169.254.169.254"], ["::1"], ["fd00::1"], ["::ffff:10.0.0.1"]])("blocks %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it("allows public addresses", () => expect(isPrivateAddress("151.101.1.69")).toBe(false));
});
