/**
 * Lender rates: built-in researched data (lib/lenders/data.ts) plus edits saved in the lender_rates table.
 * Query side: list/compare read through a short in-memory cache. Command side: save/reset clear it.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { LENDERS, type Lender } from "@/lib/lenders/data";
import { compareLenders, type MortgageInput } from "@/lib/lenders/mortgage";
import { getDb } from "@/lib/db/client";
import { lenderRates } from "@/lib/db/schema";
import { setLenderSource } from "@/lib/harness/tools/compare-mortgage-lenders";
import { audit } from "./audit";

export const lenderInput = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().trim().min(2).max(60),
  kind: z.enum(["government", "bank", "developer"]),
  rates: z.array(z.object({ fixYears: z.number().int().min(1).max(30), ratePct: z.number().min(0).max(40) })).max(12),
  maxLtvPct: z.number().min(10).max(100),
  maxTermYears: z.number().int().min(1).max(35),
  minLoan: z.number().min(0).nullable(),
  maxLoan: z.number().min(0).nullable(),
  maxAgeAtMaturity: z.number().int().min(40).max(90).nullable(),
  minMonthlyIncome: z.number().min(0).nullable(),
  fees: z.string().max(400).default(""),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceUrl: z.string().url().max(500).or(z.literal("")),
  note: z.string().max(600).default(""),
});

let cached: { at: number; data: (Lender & { edited: boolean })[] } | null = null;

/** Query: all lenders (edited copies replace the built-in ones). */
export async function listLenders(): Promise<(Lender & { edited: boolean })[]> {
  if (cached && Date.now() - cached.at < 30_000) return cached.data;
  const db = await getDb();
  const rows = await db.select().from(lenderRates).limit(100);
  const edits = new Map(rows.map((r) => [r.id, r.data as unknown as Lender]));
  const merged = [...LENDERS.map((l) => (edits.has(l.id) ? { ...l, ...edits.get(l.id)!, edited: true } : { ...l, edited: false })), ...rows.filter((r) => !LENDERS.some((l) => l.id === r.id)).map((r) => ({ ...(r.data as unknown as Lender), edited: true }))];
  cached = { at: Date.now(), data: merged };
  return merged;
}

/** Query: compare lenders for a loan. */
export async function compare(input: MortgageInput & { lenderIds?: string[] }) {
  const all = await listLenders();
  const pick = input.lenderIds?.length ? all.filter((l) => input.lenderIds!.includes(l.id)) : all;
  return compareLenders(pick, input);
}

/** Command: save edited rates for a lender (staff update rates when banks change them). */
export async function saveLender(input: z.infer<typeof lenderInput>, actorId: string) {
  const base = LENDERS.find((l) => l.id === input.id);
  const data = { ...(base ?? {}), ...input, basis: "fact", verify: false } as unknown as Record<string, unknown>;
  const db = await getDb("write");
  await db.insert(lenderRates).values({ id: input.id, data, updatedBy: actorId }).onConflictDoUpdate({ target: lenderRates.id, set: { data, updatedBy: actorId, updatedAt: new Date() } });
  await audit(actorId, "lenders.save", { lender: input.id });
  cached = null;
  return (await listLenders()).find((l) => l.id === input.id);
}

/** Command: drop an edit and go back to the built-in researched data. */
export async function resetLender(id: string, actorId: string) {
  const db = await getDb("write");
  await db.delete(lenderRates).where(eq(lenderRates.id, id));
  await audit(actorId, "lenders.reset", { lender: id });
  cached = null;
  return true;
}

setLenderSource(listLenders);
