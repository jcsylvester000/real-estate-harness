import { describe, expect, it } from "vitest";
import { classify } from "@/lib/engine/classify";
import { extractSlots } from "@/lib/engine/slots";
import { chunk, extractFacts, summarize } from "@/lib/engine/text";

describe("intent classifier (English, Filipino, Taglish, typos)", () => {
  const cases: [string, string][] = [
    ["2BR condo for rent in BGC under 60k", "find_listings"],
    ["hanap ako ng bahay sa Quezon City", "find_listings"],
    ["compare lenders for a 7.6M condo", "mortgage_compare"],
    ["saan mas mura mag loan para sa 5m", "mortgage_compare"],
    ["how much can I borrow with 80k income", "affordability"],
    ["kaya ba ng 60k sahod ang 5m na condo", "affordability"],
    ["match a buyer for a house in Cavite", "match_buyer"],
    ["sumarize the contract", "doc_summary"],
    ["what are the deadlines in the document", "doc_facts"],
    ["summarize my notes", "notes_summary"],
    ["magkano ang tax sa 3m na bahay", "costs"],
    ["Can a Japanese client buy land?", "foreign"],
    ["requirements for pag-ibig loan", "checklist"],
    ["salamat po", "thanks"],
    ["show more", "more_results"],
  ];
  it.each(cases)("%s → %s", (msg, intent) => expect(classify(msg).intent).toBe(intent));
  it("does not guess on gibberish", () => expect(classify("zzqx blorp").intent).toBeNull());
});

describe("slot extraction", () => {
  it("reads price, down payment, rate and term", () => {
    expect(extractSlots("Monthly payment on ₱7.6M, 20% down, 7%, 20 years")).toMatchObject({ price: 7_600_000, downPct: 20, ratePct: 7, termYears: 20 });
  });
  it("reads income, age, lenders and ordinals", () => {
    expect(extractSlots("income of 85k, age 40, BPI vs Pag-IBIG")).toMatchObject({ income: 85_000, age: 40, lenderIds: ["pagibig", "bpi"] });
    expect(extractSlots("yung pangalawa").ordinal).toBe(2);
    expect(extractSlots("details on #3").ordinal).toBe(3);
  });
});

describe("document text tools", () => {
  const doc = "Deed of Absolute Sale.\n\nThe Seller sells Lot 5 with an area of 250 sqm for PHP 7,600,000.00. The Buyer shall pay the balance on or before March 15, 2027.\n\nThe parties agree that taxes follow the law. Capital gains tax is for the Seller's account. Documentary stamp tax is for the Buyer.";
  it("extracts amounts, dates, areas and obligations", () => {
    const f = extractFacts(doc);
    expect(f.amounts).toContain("PHP 7,600,000.00");
    expect(f.dates).toContain("March 15, 2027");
    expect(f.areas).toContain("250 sqm");
    expect(f.actions[0]).toMatch(/shall pay/);
  });
  it("summarizes to the central sentences in order", () => {
    const s = summarize(doc, 2);
    expect(s).toHaveLength(2);
    expect(s.join(" ")).toMatch(/7,600,000/);
  });
  it("chunks long text on paragraph boundaries", () => {
    const parts = chunk(Array.from({ length: 30 }, (_, i) => `Paragraph ${i} has some words in it about the property.`).join("\n\n"), 300);
    expect(parts.length).toBeGreaterThan(3);
    expect(parts.every((p) => p.length <= 320)).toBe(true);
  });
});
