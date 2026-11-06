/**
 * Slot extraction: the facts in a message the tools need (amounts, rates, years, lender, listing, place…).
 * Reuses the listings inquiry parser for search filters.
 */
import { parseInquiry } from "@/lib/listings/inquiry";
import type { SearchInput } from "@/lib/listings/search";
import { normalize } from "./text";

export interface Slots {
  filters: SearchInput;
  understood: string[];
  /** Property price or loan base (largest amount ≥ ₱100k). */
  price?: number;
  income?: number;
  downPct?: number;
  ratePct?: number;
  termYears?: number;
  fixYears?: number;
  age?: number;
  lenderIds: string[];
  code?: string;
  /** 1-based position in the last result list ("the second one", "#2"). */
  ordinal?: number;
  /** Maceda: total paid and years of installments. */
  paid?: number;
  yearsPaid?: number;
  commissionPct?: number;
  province: boolean;
  foreign?: { propertyType: "condominium" | "land" | "house_and_lot" | "lease" };
  checklist?: "resale_titled" | "pre_selling" | "lease" | "bank_loan" | "pagibig_loan";
  party?: "buyer" | "seller";
  topic?: string;
}

/** "₱7.6M", "7,600,000", "8 million", "500k", "80 thousand" → pesos, in order of appearance with positions. */
export function amounts(text: string): { value: number; index: number; raw: string }[] {
  const out: { value: number; index: number; raw: string }[] = [];
  const re = /(₱|php\s?|p(?=\d))?\s*(\d+(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(m\b|mil\b|million\b|k\b|thousand\b)?(?!\s*(?:%|sqm|sq|years?|yrs?|taon|br\b|bedrooms?|yo\b|years old))/gi;
  for (const m of text.matchAll(re)) {
    const n = Number(m[2]!.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const u = (m[3] ?? "").toLowerCase();
    const value = u.startsWith("m") ? n * 1_000_000 : u === "k" || u === "thousand" ? n * 1_000 : n;
    if (!m[1] && !u && value < 1000) continue; // bare small numbers are counts, not money
    out.push({ value, index: m.index ?? 0, raw: m[0].trim() });
  }
  return out;
}

export const LENDER_ALIASES: Record<string, RegExp> = {
  pagibig: /\b(pag-?ibig|hdmf)\b/i,
  bdo: /\bbdo\b/i,
  bpi: /\bbpi\b/i,
  securitybank: /\bsecurity ?bank\b|\bsecbank\b/i,
  eastwest: /\beast ?west\b/i,
  psbank: /\bps ?bank\b/i,
  maybank: /\bmaybank\b/i,
  chinabank: /\bchina ?bank\b/i,
  unionbank: /\bunion ?bank\b/i,
  metrobank: /\bmetro ?bank\b/i,
  rcbc: /\brcbc\b/i,
  pnb: /\bpnb\b/i,
  landbank: /\bland ?bank\b/i,
  inhouse: /\bin-?house\b|\bdeveloper financing\b/i,
};

const ORDINALS: [RegExp, number][] = [
  [/\b(first|1st|una|unang|top (one|result))\b/i, 1],
  [/\b(second|2nd|pangalawa|ikalawa)\b/i, 2],
  [/\b(third|3rd|pangatlo|ikatlo)\b/i, 3],
  [/\b(fourth|4th|pang-?apat|ikaapat)\b/i, 4],
  [/\b(fifth|5th|panglima|ikalima)\b/i, 5],
  [/\b(last|huli)\b/i, -1],
];

export function extractSlots(text: string): Slots {
  const t = text.toLowerCase();
  const parsed = parseInquiry(text);
  const s: Slots = { filters: parsed.filters, understood: parsed.understood.map((u) => u.label), lenderIds: [], province: false };

  const pcts = [...t.matchAll(/(\d+(?:\.\d+)?)\s*%\s*(down|dp|downpayment|down payment|rate|interest|commission)?/g)].map((m) => ({ v: Number(m[1]), tag: m[2] ?? "", at: m.index ?? 0 }));
  for (const p of pcts) {
    const before = t.slice(Math.max(0, p.at - 18), p.at);
    if (/down|dp/.test(p.tag) || /\b(down|dp|downpayment)\b[^%]*$/.test(before)) s.downPct ??= p.v;
    else if (/rate|interest/.test(p.tag) || /\b(rate|interest|at)\s*$/.test(before)) s.ratePct ??= p.v;
    else if (/commission/.test(p.tag) || /commission/.test(t)) s.commissionPct ??= p.v;
  }
  // Untagged: in "20% down 7%" the first is down, the second the rate; a lone % above 12 is down payment.
  const untagged = pcts.filter((p) => p.v !== s.downPct && p.v !== s.ratePct && p.v !== s.commissionPct);
  for (const p of untagged) {
    if (/commission|komisyon/.test(t) && s.commissionPct === undefined) s.commissionPct = p.v;
    else if (s.downPct === undefined && (p.v >= 10 || pcts.length > 1)) s.downPct = p.v;
    else if (s.ratePct === undefined && p.v <= 25) s.ratePct = p.v;
  }

  const fix = t.match(/(?:fixed|fix|fixing)\s*(?:for|of|ng)?\s*(\d{1,2})\s*(?:years?|yrs?|taon)|(\d{1,2})\s*-?\s*(?:years?|yr)\s*fixed/);
  if (fix) s.fixYears = Number(fix[1] ?? fix[2]);
  const ageM = t.match(/(?:age|edad)\s*(?:is|of|:)?\s*(\d{2})\b|\b(\d{2})\s*(?:years? old|yo\b|y\.o\.|anyos)/);
  if (ageM) s.age = Number(ageM[1] ?? ageM[2]);
  const years = [...t.matchAll(/(\d{1,2})\s*(?:years?|yrs?|taon)(?!\s*(?:old|fixed))/g)].map((m) => Number(m[1]));
  const yearsCleaned = years.filter((y) => y !== s.fixYears && y !== s.age);

  const all = amounts(text);
  const big = all.filter((a) => a.value >= 100_000).sort((a, b) => b.value - a.value);
  const incomeM = t.match(/(?:income|sahod|sweldo|salary|earning|earns|kita|kumikita|makes)\s*(?:of|is|na|ng|:)?\s*(?:₱|php)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k|thousand|m)?/);
  if (incomeM) {
    const n = Number(incomeM[1]!.replace(/,/g, ""));
    const u = (incomeM[2] ?? "").toLowerCase();
    s.income = u === "k" || u === "thousand" ? n * 1000 : u === "m" ? n * 1e6 : n;
  } else {
    const before = all.find((a) => /\b(income|sahod|sweldo|salary|earning|kita)\b/.test(t.slice(a.index + a.raw.length, a.index + a.raw.length + 20)));
    if (before) s.income = before.value;
  }
  const priceCand = big.filter((a) => a.value !== s.income);
  if (priceCand[0]) s.price = priceCand[0].value;

  // Maceda: "paid 900k over 6 years"
  if (/maceda|refund|wants out|back(ed)? out|cancel|umatras/.test(t)) {
    s.paid = all.filter((a) => a.value >= 10_000).sort((a, b) => b.value - a.value)[0]?.value;
    s.yearsPaid = yearsCleaned[0];
  } else if (yearsCleaned.length) s.termYears = yearsCleaned[yearsCleaned.length - 1];

  for (const [id, re] of Object.entries(LENDER_ALIASES)) if (re.test(text)) s.lenderIds.push(id);

  const code = text.match(/\b(GRID[_-][A-Z0-9-]{3,}|DEMO-\d{3})\b/i)?.[1];
  if (code) s.code = code.toUpperCase();
  const num = t.match(/(?:#|number|no\.?|item|result|listing)\s?(\d{1,2})\b/);
  if (num) s.ordinal = Number(num[1]);
  else s.ordinal = ORDINALS.find(([re]) => re.test(t))?.[1];

  // Where: provincial municipality vs city/Metro Manila (for transfer tax).
  s.province = Boolean(parsed.filters.province && !/metro manila|ncr/i.test(parsed.filters.province)) || /\bprovinc/i.test(t);

  if (/\b(foreign(er)?|japanese|american|korean|chinese|expat|non-filipino|dayuhan|australian|british|indian)\b/.test(t))
    s.foreign = { propertyType: /condo/.test(t) ? "condominium" : /lease|rent/.test(t) ? "lease" : /house/.test(t) ? "house_and_lot" : "land" };

  s.checklist = /pag-?ibig/.test(t) ? "pagibig_loan" : /bank|loan/.test(t) ? "bank_loan" : /pre-?sell/.test(t) ? "pre_selling" : /lease|rent|upa/.test(t) ? "lease" : /resale|title|titled|transfer/.test(t) ? "resale_titled" : undefined;
  s.party = /\bseller|nagbebenta|owner\b/.test(t) ? "seller" : /\bbuyer|bibili\b/.test(t) ? "buyer" : undefined;
  const topics: [RegExp, string][] = [
    [/licens|prc|resa/, "licensing"],
    [/pre-?sell/, "pre_selling"],
    [/maceda/, "maceda_law"],
    [/foreign/, "foreign_buyers"],
    [/lease|leasing|rent|upa/, "leasing"],
    [/privacy|dpa|personal data/, "data_privacy"],
    [/financ|loan|bank/, "financing"],
    [/resale|process|transfer|title/, "resale_process"],
  ];
  s.topic = topics.find(([re]) => re.test(t))?.[1];
  return s;
}

/** True when a message is only new values for the last request ("how about 15 years", "in Makati"). */
export const hasSlotValues = (s: Slots) =>
  Boolean(s.price || s.income || s.downPct || s.ratePct || s.termYears || s.fixYears || s.age || s.lenderIds.length || Object.keys(s.filters).length);

export const norm = normalize;
