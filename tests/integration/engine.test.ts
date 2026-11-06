import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { importGridCsv } from "@/lib/listings/import";
import { createUser } from "@/lib/server/services/auth";
import { chat } from "@/lib/server/services/ai";
import { addDocument, listDocuments, searchDocuments } from "@/lib/server/services/documents";
import { write } from "@/lib/server/services/fs";
import { freshDb } from "../helpers/db";
import { freshListingsDb } from "../helpers/listings-db";

const csv = readFileSync(`${process.cwd()}/tests/fixtures/grid-listings-sample.csv`, "utf8");
const CONTRACT = `CONTRACT TO SELL

The Seller agrees to sell Unit 12B, Tower 2, with a floor area of 68 sqm, to the Buyer for a total contract price of PHP 9,500,000.00.

The Buyer shall pay a reservation fee of PHP 50,000 upon signing. The down payment of 20% shall be paid on or before March 15, 2027.

The balance shall be paid through a Pag-IBIG or bank housing loan. If the Buyer fails to pay two consecutive monthly installments, a penalty of 3% per month shall apply on the unpaid amount.

Turnover of the unit is scheduled for December 2027. The Seller shall deliver CCT No. 004-2027-11 free of liens.`;

let userId = "";
const ask = async (message: string, sessionId?: string) => chat(userId, "deal-desk", { message, sessionId, provider: "demo" });

beforeAll(async () => {
  await freshDb();
  await freshListingsDb();
  await importGridCsv({ fileName: "sample.csv", csv });
  userId = (await createUser({ username: "engine_tester", password: "a long pass phrase 123", displayName: "Tester", role: "broker" })).id;
});

describe("Query Engine (no AI)", () => {
  it("searches listings, then follows up with 'the first one' and a lender comparison", async () => {
    const t1 = await ask("2BR condo for rent in BGC under 60k");
    expect(t1.model).toBe("grid-query-engine");
    expect(t1.estimatedCostPhp).toBe(0);
    expect(t1.toolTrace[0]?.name).toBe("listings.search");
    expect(t1.reply).toMatch(/\| 1 \| TEST_/);
    const t2 = await ask("tell me about the first one", t1.sessionId);
    expect(t2.toolTrace[0]?.name).toBe("listings.get");
    expect(t2.reply).toMatch(/\*\*TEST_\d+/);
    expect(t2.reply).not.toMatch(/@/); // no uploader emails in chat
  });

  it("compares lenders and keeps the loan for follow-ups", async () => {
    const t1 = await ask("compare lenders for a 7.6M condo, 20% down");
    expect(t1.toolTrace[0]?.name).toBe("lenders.compare");
    expect(t1.reply).toContain("Pag-IBIG Fund");
    expect(t1.reply).toContain("₱7,600,000");
    const t2 = await ask("how about 15 years", t1.sessionId);
    expect(t2.toolTrace[0]?.arguments).toMatchObject({ propertyPrice: 7_600_000, termYears: 15 });
    const t3 = await ask("magkano monthly sa pag-ibig para sa 3m na bahay");
    expect(t3.toolTrace[0]?.arguments).toMatchObject({ propertyPrice: 3_000_000, lenderIds: ["pagibig"] });
  });

  it("asks for a missing price, then uses the answer", async () => {
    const t1 = await ask("what are the closing costs?");
    expect(t1.toolTrace).toHaveLength(0);
    expect(t1.reply).toMatch(/selling price/i);
    const t2 = await ask("₱5M", t1.sessionId);
    expect(t2.toolTrace[0]?.name).toBe("compute_acquisition_costs");
  });

  it("estimates affordability from income", async () => {
    const t = await ask("how much can a buyer earning 80k a month borrow?");
    expect(t.toolTrace[0]?.name).toBe("lenders.compare");
    expect(t.reply).toContain("₱28,000/month");
    expect(t.reply).toMatch(/Max price/);
  });

  it("matches a buyer and scores 1–10", async () => {
    const t = await ask("match a buyer looking for a condo for rent in Taguig under 40k");
    expect(t.toolTrace[0]?.name).toBe("match.run");
    expect(t.reply).toMatch(/\*\*\d+\/10\*\*/);
  });

  it("indexes an uploaded document, summarizes it, finds facts and answers from it", async () => {
    const doc = await addDocument(userId, { name: "Contract to Sell Unit 12B.pdf", mime: "application/pdf", method: "pdf-text", pages: [{ page: 1, text: CONTRACT }] });
    expect(doc.facts.amounts).toContain("PHP 9,500,000.00");
    expect(doc.facts.dates).toEqual(expect.arrayContaining(["March 15, 2027", "December 2027"]));
    expect((await listDocuments(userId)).length).toBe(1);
    expect((await searchDocuments(userId, "penalty")).length).toBe(1);

    const s = await ask("summarize the contract");
    expect(s.reply).toContain("Contract to Sell Unit 12B");
    expect(s.reply).toMatch(/9,500,000/);
    const f = await ask("what are the deadlines in the document?", s.sessionId);
    expect(f.reply).toContain("March 15, 2027");
    const q = await ask("what does the contract say about the penalty?", s.sessionId);
    expect(q.toolTrace[0]?.name).toBe("docs.search");
    expect(q.reply).toMatch(/3% per month/);
  });

  it("summarizes notes with action items", async () => {
    await write(userId, { path: "/Documents/Meeting with Santos family.md", content: "Met the Santos family about a house in Cavite. Budget is around 6M and they prefer a gated village near schools.\n\n- [ ] Send three listings by Friday\n- Call BDO for a pre-approval quote", createParents: true });
    const t = await ask("summarize my notes");
    expect(t.toolTrace[0]?.name).toBe("fs.read");
    expect(t.reply).toContain("Meeting with Santos family");
    expect(t.reply).toContain("- [ ] Send three listings by Friday");
  });

  it("handles small talk, help and unknown messages without tools", async () => {
    expect((await ask("salamat po")).toolTrace).toHaveLength(0);
    expect((await ask("what can you do?")).reply).toMatch(/Upload a PDF/);
    expect((await ask("are you an AI?")).reply).toMatch(/not an AI/);
    expect((await ask("zzqx blorp")).reply).toMatch(/not sure|didn't catch/);
  });
});
