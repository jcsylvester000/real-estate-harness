import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractContact, fromRows, sheetTable, toRows, understand } from "@/lib/teaser/intake";
import { fromDesign, propertyFromListing, stuckTexts, toDesign } from "@/lib/teaser/listing";
import { spellCorrect } from "@/lib/teaser/spell";
import { DECK_TEMPLATES, newDoc } from "@/lib/teaser/templates";
import { boundText } from "@/lib/teaser/format";
import { emptyProperty } from "@/lib/teaser/types";
import { writeXlsx } from "@/lib/teaser/xlsx";

const ALL = `Verde Residences
Beautifull 2 bedrom condominum in Alabng, 68 sqm, 2 baths, 1 parking. Fully furnised, high floor with lake view.
Amenities: swiming pool, gym, 24/7 security. Near Festival Mall, 5 minutes to SLEX.
Price: P8.5M. 20% downpayment payable in 24 months, balance via bank financing.
Contact Ana Cruz, Licensed Real Estate Broker, 0917 123 4567, ana@cruzrealty.ph, Cruz Realty, PRC No. 0012345`;

describe("spelling", () => {
  it("fixes common real-estate misspellings and place names, and lists each fix", () => {
    const r = spellCorrect("Beautifull 3 bedrom condominum in Alabng with swiming pool and balcany. Fully furnised, ready for ocupancy.");
    expect(r.text).toBe("Beautiful 3 bedroom condominium in Alabang with swimming pool and balcony. Fully furnished, ready for occupancy.");
    expect(r.corrections).toContainEqual({ from: "Alabng", to: "Alabang", place: true });
  });
  it("leaves correct words, Filipino, short words and mid-sentence names alone", () => {
    for (const t of ["Maganda ang bahay sa Tagaytay, malapit sa paaralan.", "Unit at Avida Towers by Megaworld.", "2BR w/ CR and lanai"]) expect(spellCorrect(t).corrections).toEqual([]);
  });
});

describe("intake", () => {
  const u = understand({ all: ALL });
  it("reads the property from free text, after fixing spelling", () => {
    expect(u.property).toMatchObject({ name: "Verde Residences", price: 8_500_000, bedrooms: 2, bathrooms: 2, floorArea: 68, parking: 1, location: "Alabang", kind: "Condominium unit" });
    expect(u.property.description).toContain("Beautiful 2 bedroom condominium");
    expect(u.property.description).not.toMatch(/downpayment|0917/);
    expect(u.property.amenities).toEqual(expect.arrayContaining(["pool", "gym", "security"]));
    expect(u.property.paymentTerms).toMatch(/20% downpayment/);
    expect(u.property.nearby).toEqual(expect.arrayContaining(["Festival Mall"]));
    expect(u.corrections.map((c) => c.to)).toEqual(expect.arrayContaining(["Beautiful", "bedroom", "Alabang", "swimming"]));
  });
  it("reads the contact details", () => {
    expect(u.agent).toMatchObject({ name: "Ana Cruz", phone: "0917 123 4567", email: "ana@cruzrealty.ph", company: "Cruz Realty", license: "0012345", title: "Licensed Real Estate Broker" });
    expect(extractContact("Mark Dela Cruz\n09171234567\nMD Properties")).toMatchObject({ name: "Mark Dela Cruz", phone: "09171234567", company: "MD Properties" });
  });
  it("guided sections work the same way, and missing details are named", () => {
    const g = understand({ details: "Casa Mira townhouse in Quezon City, 3 bedroms", contact: "" });
    expect(g.property).toMatchObject({ name: "Casa Mira townhouse", bedrooms: 3 });
    expect(g.notes.join(" ")).toMatch(/price.*contact/);
  });
  it("round-trips through the sheet", () => {
    const rows = toRows(u.property, u.agent);
    const back = fromRows(rows, emptyProperty());
    expect(back.property).toMatchObject({ name: u.property.name, price: u.property.price, bedrooms: 2, amenities: u.property.amenities, highlights: u.property.highlights });
    expect(back.agent).toEqual(u.agent);
    const edited = fromRows(rows.map((r) => (r.key === "price" ? { ...r, value: "₱9.2M" } : r.key === "amenities" ? { ...r, value: "Pool, rooftop deck, Koi pond" } : r)), emptyProperty());
    expect(edited.property.price).toBe(9_200_000);
    expect(edited.property.amenities).toContain("custom:Koi pond");
  });
  it("writes a real Excel file", async () => {
    const blob = await writeXlsx([{ name: "Property", rows: sheetTable(toRows(u.property, u.agent), 3), widths: [16, 28, 70] }]);
    const z = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await z.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(xml).toContain("Verde Residences");
    expect(xml).toContain("ana@cruzrealty.ph");
    expect(await z.file("xl/workbook.xml")!.async("string")).toContain('name="Property"');
  });
});

describe("saved designs", () => {
  const l = { code: "GRD-1", name: "Azure North 1BR", notes: "Fully furnished 1BR with pool", transactionType: "sale", kindLabel: "Condominium unit", price: 4_500_000, location: "San Fernando", city: "San Fernando", bedrooms: 1, bathrooms: 1, floorAreaSqm: 30, lotAreaSqm: null };
  it("keeps the look and switches the property", () => {
    const t = DECK_TEMPLATES[3]!;
    const doc = newDoc(t, { property: { ...emptyProperty(), name: "Verde Residences", price: 8_500_000 } });
    doc.brand.primary = "#123456";
    const design = toDesign(doc);
    expect(design.property.name).toBe("");
    expect(design.brand.primary).toBe("#123456");
    const next = fromDesign(design, propertyFromListing(l));
    expect(next.slides.length).toBe(doc.slides.length);
    expect(next.brand.primary).toBe("#123456");
    expect(boundText("property.name", next)).toBe("Azure North 1BR");
    expect(boundText("property.price", next)).toBe("₱4.5M");
    expect(next.property.listingCode).toBe("GRD-1");
  });
  it("warns about hand-typed texts that mention the property", () => {
    const doc = newDoc(DECK_TEMPLATES[0]!, { property: { ...emptyProperty(), name: "Verde Residences" } });
    doc.slides[0]!.elements.push({ id: "x", type: "text", text: "Welcome to Verde Residences", x: 0, y: 0, w: 100, h: 40, font: "$body", size: 20, weight: 400, color: "$ink", align: "left", lineHeight: 1.2 });
    expect(stuckTexts(doc)).toEqual(["Welcome to Verde Residences"]);
  });
});
