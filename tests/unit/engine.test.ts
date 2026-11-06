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

import { predict } from "@/components/apps/predict";
import { parseAmount } from "@/components/apps/command-menu";
describe("Deal Desk typing helpers", () => {
  const ctx = { asks: ["Compare lenders for TEST_0006, 20% down, 20 years"], places: ["Taguig", "Makati"], docs: ["Contract to Sell"] };
  it("completes from the user's own questions first, then common phrasings, then words", () => {
    expect(predict("Compare lenders for T", ctx)).toBe("EST_0006, 20% down, 20 years");
    expect(predict("How much can a buyer", ctx)).toBe(" earning ₱80k a month afford?");
    expect(predict("condo for rent in Tag", ctx)).toBe("uig");
    expect(predict("/sea", ctx)).toBe("");
  });
  it("reads typed amounts", () => {
    expect(parseAmount("7.6M")).toBe(7_600_000);
    expect(parseAmount("₱60k")).toBe(60_000);
    expect(parseAmount("1,250,000")).toBe(1_250_000);
    expect(parseAmount("abc")).toBeNull();
  });
});
