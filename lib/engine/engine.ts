/**
 * GRID Query Engine: Deal Desk's no-AI mode.
 *
 *   message → classify (TF-IDF over the phrase library + cues) → extract slots → resolve with dialogue state
 *           → pick a tool (listings, matching, lenders, calculators, documents, notes) → run it
 *           → write the reply from templates using only the tool's numbers → remember state for follow-ups.
 *
 * The engine never invents figures: every number in a reply comes from a tool result.
 * Tools are injected (EngineTools) so the engine can be tested without a database.
 */
import { summarize as describeToolResult } from "@/lib/harness/providers/demo";
import type { LenderQuote } from "@/lib/lenders/mortgage";
import { findFeatures } from "@/lib/listings/analyze";
import type { BuyerCriteria, MatchScore } from "@/lib/listings/match";
import { php } from "@/lib/listings/money";
import type { IndexFacets, ListingCard, SearchInput, SearchResult } from "@/lib/listings/search";
import { classify } from "./classify";
import { FOLLOW_UP, INTENTS, RESPONSES, isFilipino, pick, type IntentId } from "./lexicon";
import { extractSlots, hasSlotValues, type Slots } from "./slots";
import { bestSentences, summarize, tokens, type DocFacts } from "./text";

export interface EngineDoc {
  id: string;
  name: string;
  pages: number;
  method: string;
  ocrConfidence: number | null;
  summary: string;
  facts: DocFacts;
  createdAt: string;
}

export interface EngineTools {
  search(input: SearchInput): Promise<SearchResult>;
  getListing(code: string): Promise<(ListingCard & { analysis: Record<string, unknown> }) | null>;
  facets(): Promise<IndexFacets>;
  match(criteria: BuyerCriteria, page: { limit: number; offset: number }): Promise<{ total: number; excluded: number; belowMinimum: number; results: { listing: ListingCard; match: MatchScore }[] }>;
  buyersForListing(code: string): Promise<{ label: string; description: string; score: number; rating: number }[]>;
  compareLenders(input: Record<string, unknown>): Promise<{ quotes: LenderQuote[]; disclaimer: string }>;
  /** Harness calculator and rulebook tools by name. */
  runTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; result: unknown }>;
  listDocuments(): Promise<EngineDoc[]>;
  getDocumentText(id: string): Promise<string>;
  searchDocuments(q: string, documentIds?: string[]): Promise<{ documentId: string; name: string; page: number | null; text: string }[]>;
  notes(): Promise<{ path: string; name: string; content: string; updatedAt: string }[]>;
  /** Saved buyer profiles (Buyer Matching). */
  buyers(): Promise<{ id: string; label: string; criteria: BuyerCriteria }[]>;
}

/** What the engine remembers between turns of one conversation. */
export interface EngineState {
  turn: number;
  lastIntent?: IntentId;
  /** Intent waiting for a missing value (e.g. a price). */
  pending?: IntentId;
  filters?: SearchInput;
  criteria?: BuyerCriteria;
  page?: number;
  /** Codes shown in the last list, for "the second one". */
  lastCodes?: string[];
  focusCode?: string;
  focusPrice?: number;
  focusDocId?: string;
  loan?: { price?: number; downPct?: number; termYears?: number; fixYears?: number; income?: number; age?: number; ratePct?: number; lenderIds?: string[] };
}

export interface EngineReply {
  reply: string;
  intent: IntentId | null;
  confidence: number;
  trace: { name: string; arguments: Record<string, unknown>; result: unknown }[];
  state: EngineState;
  suggestions: string[];
}

const REFINABLE: IntentId[] = ["find_listings", "match_buyer", "mortgage_compare", "loan_payment", "affordability", "costs", "commission"];
const DOC_INTENTS: IntentId[] = ["doc_summary", "doc_ask", "doc_facts"];
const PAGE = 5;

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
const cell = (s: unknown) => String(s ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
const priceOf = (l: ListingCard) => (l.transactionType === "lease" ? `${php(l.price)}/mo` : php(l.price));
const sizeOf = (l: ListingCard) => (l.floorAreaSqm ? `${l.floorAreaSqm} sqm` : l.lotAreaSqm ? `${l.lotAreaSqm} sqm lot` : "");

/** Picks the document a message refers to: by name words, else the one in focus, else the newest. */
function pickDoc(message: string, docs: EngineDoc[], focus?: string) {
  const words = new Set(tokens(message));
  let best: EngineDoc | undefined;
  let bestHits = 0;
  for (const d of docs) {
    const hits = tokens(d.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, " ")).filter((w) => w.length > 2 && words.has(w)).length;
    if (hits > bestHits) {
      best = d;
      bestHits = hits;
    }
  }
  return best ?? docs.find((d) => d.id === focus) ?? docs[0];
}

/** Does the message name one of the user's documents ("the lease", "the reservation")? */
function mentionsDoc(message: string, docs: EngineDoc[]) {
  const words = new Set(tokens(message));
  return docs.some((d) => tokens(d.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, " ")).some((w) => w.length > 3 && words.has(w)));
}

function decideIntent(message: string, slots: Slots, state: EngineState, cls: ReturnType<typeof classify>, docs: EngineDoc[]): IntentId | null {
  const hasDocs = docs.length > 0;
  const strong = cls.intent && cls.confidence >= 0.6 ? cls.intent : null;
  // A missing value was asked for and this message supplies it.
  if (state.pending && hasSlotValues(slots) && (!strong || cls.confidence < 0.9)) return state.pending;
  // "how about 15 years", "in Makati instead", "cheaper": same request, new values.
  const followUp = FOLLOW_UP.test(message.trim()) || (cls.confidence < 0.45 && hasSlotValues(slots));
  if (followUp && state.lastIntent && REFINABLE.includes(state.lastIntent) && (!strong || REFINABLE.includes(strong) || cls.confidence < 0.9)) {
    // A new topic word (lender, tax…) wins over the follow-up.
    if (strong && strong !== state.lastIntent && cls.confidence >= 0.9) return strong;
    return state.lastIntent;
  }
  // "the second one" after a list.
  if (slots.ordinal && state.lastCodes?.length && (!strong || strong === "listing_details" || cls.confidence < 0.8)) {
    if (cls.intent === "buyers_for_listing" || cls.intent === "mortgage_compare" || cls.intent === "costs") return cls.intent;
    return "listing_details";
  }
  let intent = cls.intent;
  // A question that names an uploaded document is about that document.
  if (hasDocs && !/\bnotes?\b/i.test(message) && !slots.code && (mentionsDoc(message, docs) || /\b(say|says|said|sabi|nakasulat|mention(s|ed)?)\b/i.test(message)) && !(intent && DOC_INTENTS.includes(intent)) && intent !== "doc_list") {
    if (/\b(summar|buod|gist|tl;?dr|key points|overview)/i.test(message)) return "doc_summary";
    if (/\b(deadlines?|dates?|amounts?|figures?|action items?|to-?dos?|petsa)\b/i.test(message)) return "doc_facts";
    if (!slots.price && !slots.income) return "doc_ask";
  }
  // Document words without uploads → it is probably about listings or notes.
  if (intent && DOC_INTENTS.includes(intent) && /\bnotes?\b/i.test(message) && !mentionsDoc(message, docs)) intent = "notes_summary";
  if (intent === "doc_summary" && /\bnotes?\b/i.test(message)) intent = "notes_summary";
  if (intent === "loan_payment" && slots.ratePct === undefined) intent = "mortgage_compare";
  if (!intent && Object.keys(slots.filters).length) intent = "find_listings";
  return intent;
}

export async function runEngine(message: string, prev: EngineState | null, tools: EngineTools): Promise<EngineReply> {
  const state: EngineState = { ...(prev ?? { turn: 0 }), turn: (prev?.turn ?? 0) + 1 };
  const seed = hash(message) + state.turn;
  const fil = isFilipino(message);
  const slots = extractSlots(message);
  const cls = classify(message);
  const docs = await tools.listDocuments();
  const intent = decideIntent(message, slots, state, cls, docs);
  const trace: EngineReply["trace"] = [];
  const run = async (name: string, args: Record<string, unknown>, fn: () => Promise<unknown>) => {
    const result = await fn();
    trace.push({ name, arguments: args, result });
    return result;
  };
  /** Harness calculator/rulebook tool; the trace keeps its result unwrapped. */
  const tool = async (name: string, args: Record<string, unknown>) => ({ result: await run(name, args, async () => (await tools.runTool(name, args)).result) });
  const suggestions: string[] = [];
  const parts: string[] = [];
  let asking = false;
  const out = (reply: string, i: IntentId | null = intent): EngineReply => {
    state.lastIntent = i && !["help", "greet", "thanks", "bye", "identity"].includes(i) ? i : state.lastIntent;
    state.pending = asking ? (i ?? undefined) : trace.length ? undefined : state.pending;
    const tail = trace.length ? `\n\n${RESPONSES.disclaimer}` : "";
    const sug = suggestions.length ? `\n\n**Next:** ${suggestions.map((s) => `“${s}”`).join(" · ")}` : "";
    return { reply: reply + sug + tail, intent: i, confidence: cls.confidence, trace, state, suggestions };
  };
  const ask = (i: IntentId, question: string) => {
    asking = true;
    return out(`${pick(RESPONSES.clarify, seed)} ${question}`, i);
  };

  switch (intent) {
    case null:
      return out(pick(RESPONSES.fallback, seed), null);
    case "greet":
      return out(pick(RESPONSES.greet, seed + (fil ? 2 : 0)));
    case "thanks":
      return out(pick(RESPONSES.thanks, seed));
    case "bye":
      return out(pick(RESPONSES.bye, seed));
    case "identity":
      return out(RESPONSES.identity[0]);
    case "help": {
      const lines = (["find_listings", "match_buyer", "mortgage_compare", "affordability", "costs", "doc_summary", "doc_ask", "doc_facts", "notes_summary", "checklist"] as IntentId[]).map((id) => `- **${INTENTS[id].does}** e.g. “${INTENTS[id].examples[0]}”`);
      return out(`Here's what I can do without an AI key:\n\n${lines.join("\n")}\n\nUpload a PDF, Word file or photo with the 📎 button and I can summarize it, pull out dates and amounts, or answer questions from it. I remember the conversation, so you can follow up with “how about 15 years?” or “the second one”.`);
    }

    case "find_listings":
    case "more_results": {
      if (intent === "more_results" && state.lastIntent === "match_buyer" && state.criteria) return matchTurn(true);
      const more = intent === "more_results";
      if (more && !state.filters) return out("There's no earlier search to continue. What should I look for?", null);
      const filters: SearchInput = more ? state.filters! : state.lastIntent === "find_listings" && FOLLOW_UP.test(message.trim()) ? { ...state.filters, ...slots.filters } : slots.filters;
      if (/\b(cheaper|mas mura)\b/i.test(message) && state.filters?.maxPrice) filters.maxPrice = Math.round(state.filters.maxPrice * 0.8);
      state.page = more ? (state.page ?? 0) + 1 : 0;
      state.filters = filters;
      const args = { ...filters, limit: PAGE, offset: state.page * PAGE };
      const r = (await run("listings.search", args, () => tools.search(args))) as SearchResult;
      if (!r.total) {
        // Widen one filter at a time and say which.
        const tries: [string, SearchInput][] = [];
        // Only keywords and nothing matched: the message probably was not a search at all.
        if (!cls.intent && Object.keys(filters).every((k) => k === "query")) return out(pick(RESPONSES.fallback, seed), null);
        if (filters.query && Object.keys(filters).length > 1) tries.push(["without the keywords", { ...filters, query: undefined }]);
        if (filters.minBedrooms) tries.push(["with fewer bedrooms", { ...filters, minBedrooms: undefined }]);
        if (filters.maxPrice) tries.push([`up to ${php(Math.round(filters.maxPrice * 1.25))}`, { ...filters, maxPrice: Math.round(filters.maxPrice * 1.25) }]);
        if (filters.city) tries.push(["anywhere in the area", { ...filters, city: undefined }]);
        for (const [why, f] of tries) {
          const a = { ...f, limit: PAGE };
          const w = (await run("listings.search", a, () => tools.search(a))) as SearchResult;
          if (w.total) {
            state.filters = f;
            parts.push(`${pick(RESPONSES.noResults, seed)} The closest I have is **${why}**: ${w.total} listing${w.total === 1 ? "" : "s"}.`);
            parts.push(listingTable(w.listings, 0));
            state.lastCodes = w.listings.map((l) => l.code);
            suggestions.push("details on #1", "match a buyer for this");
            return out(parts.join("\n\n"));
          }
        }
        return out(`${pick(RESPONSES.noResults, seed)} Try a nearby city, a higher budget or fewer filters.`);
      }
      state.lastCodes = r.listings.map((l) => l.code);
      const shown = state.page * PAGE + r.listings.length;
      parts.push(`${fil ? "Heto ang nakita ko." : pick(RESPONSES.searching, seed)} **${r.total}** listing${r.total === 1 ? "" : "s"} match${r.total === 1 ? "es" : ""}${r.total > PAGE ? `; showing ${state.page * PAGE + 1}–${shown}` : ""}.`);
      if (slots.understood.length && !more) parts.push(`_Understood: ${slots.understood.join(" · ")}_`);
      parts.push(listingTable(r.listings, state.page * PAGE));
      const notes = r.notes.filter((n) => !/Do not invent/.test(n));
      if (notes.length) parts.push(notes.map((n) => `_${n}_`).join(" "));
      if (shown < r.total) suggestions.push("show more");
      suggestions.push("details on #1", "compare lenders for #1");
      return out(parts.join("\n\n"));
    }

    case "listing_details": {
      const code = slots.code ?? (slots.ordinal && state.lastCodes ? state.lastCodes[slots.ordinal === -1 ? state.lastCodes.length - 1 : slots.ordinal - 1] : state.focusCode);
      if (!code) return ask("listing_details", "Which listing? Give me its code (e.g. GRID-…) or search first.");
      const l = await run("listings.get", { code }, () => tools.getListing(code));
      if (!l) return out(`I can't find listing ${code}. It may have been removed.`);
      const d = l as ListingCard & { analysis: { summary?: string; missing?: string[]; quality?: number } };
      state.focusCode = d.code;
      state.focusPrice = d.transactionType === "sale" ? d.price : undefined;
      const lines = [
        `**${d.code} · ${cell(d.name)}**`,
        "",
        `- ${d.kindLabel}${d.kindInferred ? " (inferred)" : ""}, for ${d.transactionType === "lease" ? "rent" : "sale"}: **${priceOf(d)}**`,
        `- ${d.location}`,
        d.bedrooms !== null ? `- ${d.bedrooms} bedroom${d.bedrooms === 1 ? "" : "s"}` : "",
        sizeOf(d) ? `- ${sizeOf(d)}` : "",
        d.features.length ? `- Features: ${d.features.join(", ")}` : "",
        d.analysis.summary ? `\n${d.analysis.summary}` : "",
        d.analysis.missing?.length ? `\n_Not stated in the listing: ${d.analysis.missing.join(", ")}._` : "",
      ];
      suggestions.push("which buyers match it?");
      if (state.focusPrice) suggestions.push("compare lenders for it", "costs to buy it");
      return out(lines.filter(Boolean).join("\n"));
    }

    case "inventory": {
      const f = (await run("listings.index", {}, () => tools.facets())) as IndexFacets;
      if (!f.totalAvailable) return out("The listings index is empty. Import a CSV in the Listings app first.");
      const tx = f.byTransaction.map((x) => `${x.count} for ${x.value === "lease" ? "rent" : "sale"}`).join(", ");
      const kinds = f.byKind.slice(0, 6).map((k) => `${k.label} (${k.count})`).join(", ");
      const cities = f.byCity.slice(0, 8).map((c) => `${c.city} (${c.count})`).join(", ");
      suggestions.push("condos for sale in Makati", "warehouses for lease");
      return out([`We have **${f.totalAvailable} available listings** (${tx}).`, `Most common: ${kinds}.`, `Top cities: ${cities}.`].join("\n\n"));
    }

    case "match_buyer":
      return matchTurn(false);

    case "buyers_for_listing": {
      const code = slots.code ?? (slots.ordinal && state.lastCodes ? state.lastCodes[slots.ordinal - 1] : state.focusCode);
      if (!code) return ask("buyers_for_listing", "Which listing should I check against the saved buyers?");
      state.focusCode = code;
      const bs = (await run("match.forListing", { code }, () => tools.buyersForListing(code))) as Awaited<ReturnType<EngineTools["buyersForListing"]>>;
      if (!bs.length) {
        suggestions.push(`details on ${code}`);
        return out(`No saved buyer matches **${code}** at their minimum score yet. Save buyers in Buyer Matching and they are scored against every listing automatically.`);
      }
      return out([`**${bs.length}** saved buyer${bs.length === 1 ? "" : "s"} match **${code}**:`, "", "| Score | Buyer | Looking for |", "|---|---|---|", ...bs.slice(0, 8).map((b) => `| ${b.rating}/10 | ${cell(b.label)} | ${cell(b.description)} |`)].join("\n"));
    }

    case "mortgage_compare":
    case "affordability":
    case "loan_payment": {
      const loan = { ...state.loan };
      if (slots.price) loan.price = slots.price;
      if (slots.downPct !== undefined) loan.downPct = slots.downPct;
      if (slots.termYears) loan.termYears = slots.termYears;
      if (slots.fixYears) loan.fixYears = slots.fixYears;
      if (slots.income) loan.income = slots.income;
      if (slots.age) loan.age = slots.age;
      if (slots.ratePct !== undefined) loan.ratePct = slots.ratePct;
      if (slots.lenderIds.length) loan.lenderIds = slots.lenderIds;
      else if (/\b(all|lahat|compare|every|banks)\b/i.test(message)) loan.lenderIds = undefined;
      if (!slots.price && (slots.code || (slots.ordinal && state.lastCodes))) {
        const l = await tools.getListing(slots.code ?? state.lastCodes![slots.ordinal! - 1]!);
        if (l?.transactionType === "sale") {
          loan.price = l.price;
          state.focusCode = l.code;
        }
      }
      if (!loan.price && /\b(it|this|that|ito|iyan|yan)\b/i.test(message) && state.focusPrice) loan.price = state.focusPrice;
      state.loan = loan;
      if (intent === "affordability") return affordTurn(loan);
      if (!loan.price) return ask(intent, "What is the property price? (e.g. “₱7.6M”)");
      const term = loan.termYears ?? 20;
      const down = loan.downPct ?? 20;
      if (intent === "loan_payment" && loan.ratePct !== undefined && !slots.lenderIds.length) {
        const args = { propertyPrice: loan.price, downPaymentPercent: down, annualInterestRatePercent: loan.ratePct, termYears: term, lender: "bank" };
        const r = (await tool("compute_loan_amortization", args)) as { result: unknown };
        suggestions.push("compare lenders", `how about ${term === 20 ? 15 : 20} years`);
        return out(describeToolResult("compute_loan_amortization", r.result));
      }
      const args = { propertyPrice: loan.price, downPaymentPercent: down, termYears: term, fixYears: loan.fixYears ?? 3, monthlyGrossIncome: loan.income, borrowerAge: loan.age, lenderIds: loan.lenderIds };
      const r = (await run("lenders.compare", args, () => tools.compareLenders(args))) as { quotes: LenderQuote[]; disclaimer: string };
      const q = r.quotes.filter((x) => x.quoted);
      const ok = q.filter((x) => x.eligible);
      const head = `${fil ? "Heto ang comparison ng mga lender" : pick(RESPONSES.mortgageIntro, seed).replace(/:$/, "")} for **${php(loan.price)}**, ${down}% down, ${term} years${loan.income ? `, income ${php(loan.income)}/mo` : ""}:`;
      const rows = (loan.lenderIds ? q : q.slice(0, 6)).map((x) => `| ${cell(x.lender)}${x.basis === "estimate" ? " (est.)" : ""} | ${x.ratePct}% · ${cell(x.rateLabel)} | **${php(x.monthlyPayment ?? 0)}** | ${x.eligible ? "✓" : cell(x.issues[0] ?? "")} |`);
      parts.push(head, "", "| Lender | Rate | Monthly | Eligible |", "|---|---|---|---|", ...rows);
      if (ok[0] && !loan.lenderIds) parts.push("", `Lowest eligible: **${ok[0].lender}** at ${php(ok[0].monthlyPayment ?? 0)}/month (${ok[0].rateLabel}).`);
      const promo = q.find((x) => x.notes.some((n) => /Promo/.test(n)));
      if (promo) parts.push(`_${promo.lender}: ${promo.notes.find((n) => /Promo/.test(n))}_`);
      const unpublished = r.quotes.filter((x) => !x.quoted).map((x) => x.lender);
      if (unpublished.length && !loan.lenderIds) parts.push(`_No published rate: ${unpublished.join(", ")}. Enter their quoted rate in Calculators → Home loan._`);
      parts.push("", `_${r.disclaimer}_`);
      suggestions.push(`how about ${term === 20 ? 15 : 20} years`, loan.income ? "with 30% down" : "with income 80k", "costs to buy it");
      state.focusPrice = loan.price;
      return out(parts.join("\n"));
    }

    case "costs":
    case "commission":
    case "maceda":
    case "foreign": {
      const price = slots.price ?? (slots.code ? (await tools.getListing(slots.code))?.price : undefined) ?? (FOLLOW_UP.test(message) || /\b(it|this|ito)\b/i.test(message) ? state.focusPrice ?? state.loan?.price : undefined) ?? (slots.ordinal && state.lastCodes ? (await tools.getListing(state.lastCodes[slots.ordinal - 1]!))?.price : undefined);
      let name = "";
      let args: Record<string, unknown> = {};
      if (intent === "costs") {
        if (!price) return ask("costs", "What is the selling price?");
        name = "compute_acquisition_costs";
        args = { sellingPrice: price, lguType: slots.province ? "province" : "city_or_metro_manila" };
        state.focusPrice = price;
      } else if (intent === "commission") {
        if (!price) return ask("commission", "What is the sale price, and the commission rate?");
        name = "compute_commission";
        args = { salePrice: price, commissionRatePercent: slots.commissionPct ?? slots.ratePct ?? 5 };
      } else if (intent === "maceda") {
        if (!slots.paid) return ask("maceda", "How much has the buyer paid in total, and over how many years?");
        name = "compute_maceda_refund";
        args = { totalPaymentsMade: slots.paid, yearsOfInstallmentsPaid: slots.yearsPaid ?? 2 };
      } else {
        name = "check_foreign_ownership";
        args = { buyerType: "foreign_individual", propertyType: slots.foreign?.propertyType ?? "land" };
      }
      const r = (await tool(name, args)) as { result: unknown };
      if (intent === "costs") suggestions.push("compare lenders for it", "commission on it at 5%");
      if (intent === "commission" && !slots.commissionPct && !slots.ratePct) parts.push("_Commission rate not given; 5% used._");
      if (intent === "maceda" && !slots.yearsPaid) parts.push("_Years of installments not given; 2 used._");
      return out([describeToolResult(name, r.result), ...parts].join("\n\n"));
    }

    case "checklist": {
      const args = { transactionType: slots.checklist ?? "resale_titled", ...(slots.party ? { party: slots.party } : {}) };
      const r = (await tool("get_document_checklist", args)) as { result: Record<string, { document: string; office?: string }[]> };
      const lines = Object.entries(r.result ?? {}).flatMap(([party, items]) => [`**${party[0]!.toUpperCase()}${party.slice(1)}**`, ...(items ?? []).map((i) => `- ${i.document}${i.office ? ` _(${i.office})_` : ""}`), ""]);
      if (!slots.checklist) parts.push("_No transaction type given; showing a titled resale. Say “for a Pag-IBIG loan”, “bank loan”, “pre-selling” or “lease” for others._");
      return out([`Documents for a **${args.transactionType.replace(/_/g, " ")}**:`, "", ...lines, ...parts].join("\n"));
    }

    case "rule": {
      const topic = slots.topic ?? "resale_process";
      const r = (await tool("get_rule_topic", { topic })) as { result: { title: string; summary: string; points: string[]; laws: string[] } };
      const t = r.result;
      return out([`**${t.title}**`, "", t.summary, "", ...t.points.map((p) => `- ${p}`), "", `_Basis: ${t.laws.join("; ")}. Guidance, not legal advice._`].join("\n"));
    }

    case "doc_list": {
      trace.push({ name: "docs.list", arguments: {}, result: { count: docs.length } });
      if (!docs.length) return out("You haven't uploaded any documents yet. Use the 📎 button to add a PDF, Word file or photo.");
      return out([`You have **${docs.length}** document${docs.length === 1 ? "" : "s"}:`, "", ...docs.slice(0, 20).map((d, i) => `${i + 1}. **${cell(d.name)}** · ${d.pages} page${d.pages === 1 ? "" : "s"} · ${methodLabel(d)}`)].join("\n"));
    }

    case "doc_summary":
    case "doc_facts":
    case "doc_ask": {
      if (!docs.length) return out("Upload a document first (📎 button: PDF, Word, text or a photo of a page). Then I can summarize it or answer questions from it.");
      const doc = pickDoc(message, docs, state.focusDocId)!;
      state.focusDocId = doc.id;
      if (intent === "doc_summary") {
        trace.push({ name: "docs.summarize", arguments: { id: doc.id }, result: { summary: doc.summary } });
        const text = await tools.getDocumentText(doc.id);
        const pts = summarize(text, 5);
        parts.push(`**${pick(RESPONSES.docIntro, seed)}: ${cell(doc.name)}** (${doc.pages} page${doc.pages === 1 ? "" : "s"}, ${methodLabel(doc)})`, "", ...pts.map((p) => `- ${p}`));
        parts.push(...factLines(doc.facts, false));
        suggestions.push("what are the deadlines?", "what does it say about payment?");
        return out(parts.join("\n"));
      }
      if (intent === "doc_facts") {
        trace.push({ name: "docs.facts", arguments: { id: doc.id }, result: doc.facts });
        const datesOnly = /\b(deadlines?|dates?|when|kailan|petsa)\b/i.test(message);
        const lines = factLines(doc.facts, datesOnly);
        if (!lines.length) return out(`I didn't find ${datesOnly ? "dates or deadlines" : "amounts, dates or action items"} in **${cell(doc.name)}**.`);
        return out([`From **${cell(doc.name)}**:`, ...lines].join("\n"));
      }
      // doc_ask: retrieve passages, then quote the best sentences.
      const q = message.replace(/\b(in|from|according to|sa|ayon sa)?\s*(the|my|yung|ang)?\s*(document|contract|deed|agreement|file|kontrata|dokumento|upload)s?\b/gi, " ");
      const named = tokens(message).some((w) => tokens(doc.name).includes(w));
      const passages = (await run("docs.search", { q, documentIds: named ? [doc.id] : undefined }, () => tools.searchDocuments(q, named ? [doc.id] : undefined))) as Awaited<ReturnType<EngineTools["searchDocuments"]>>;
      const best = bestSentences(q, passages.map((p) => ({ text: p.text, ref: `${p.name}${p.page ? `, p. ${p.page}` : ""}` })), 3);
      if (!best.length) return out(`I couldn't find that in ${named ? `**${cell(doc.name)}**` : "your documents"}. Try other words, or ask me to summarize it.`);
      const top = best.filter((b) => b.score >= best[0]!.score * 0.5);
      return out([`${pick(RESPONSES.docIntro, seed)}:`, "", ...top.map((b) => `- “${b.s}” — _${cell(b.ref)}_`)].join("\n"));
    }

    case "notes_summary": {
      let notes = (await tools.notes()).filter((n) => !/^\/Deals\/deal-desk-/.test(n.path) && n.content.trim().length > 20);
      // "summarize note Meeting with Santos" → just that note.
      const words = new Set(tokens(message));
      const named = notes.filter((n) => {
        const ts = tokens(n.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, " ")).filter((w) => w.length > 2);
        return ts.length > 0 && ts.filter((w) => words.has(w)).length >= Math.min(2, ts.length);
      });
      if (named.length) notes = named.slice(0, 1);
      const actionsOnly = /\b(action items?|to-?dos?|tasks?|gagawin)\b/i.test(message);
      trace.push({ name: "fs.read", arguments: { notes: notes.length }, result: notes.map((n) => n.path) });
      if (!notes.length) return out("I didn't find any notes in Files yet. Write one in the Notes app (it saves to Documents) and ask again.");
      const lines: string[] = named.length ? [] : [`Your **${notes.length}** most recent note${notes.length === 1 ? "" : "s"}:`, ""];
      const actions: string[] = [];
      for (const n of notes.slice(0, 6)) {
        actions.push(...extractActions(n.content));
        if (actionsOnly) continue;
        const s = summarize(n.content, named.length ? 4 : 2);
        lines.push(`**${cell(n.name)}**`, ...(s.length ? s : [n.content.slice(0, 200)]).map((x) => `- ${x}`), "");
      }
      if (actions.length) lines.push(actionsOnly ? `**Action items${named.length ? ` in ${cell(notes[0]!.name)}` : ""}**` : "**Action items**", ...[...new Set(actions)].slice(0, 10).map((a) => `- [ ] ${a}`));
      else if (actionsOnly) lines.push("I didn't find action items (lines starting with “- [ ]”, “Call”, “Send”, “Follow up”…).");
      suggestions.push(actionsOnly ? "summarize my notes" : "action items from my notes");
      return out(lines.join("\n"));
    }
  }
  return out(pick(RESPONSES.fallback, seed), null);

  // -- helpers that use the turn's state --

  /** "matches for saved buyer BGC renter" → that saved profile. */
  async function findSavedBuyer() {
    if (!/\bsaved buyer|\bbuyer profile|\bmatches for\b/i.test(message)) return undefined;
    const list = await tools.buyers();
    const m = message.toLowerCase();
    return list.find((b) => m.includes(b.label.toLowerCase())) ?? list.find((b) => tokens(b.label).filter((w) => w.length > 2).every((w) => tokens(message).includes(w)));
  }

  async function matchTurn(more: boolean): Promise<EngineReply> {
    let c: BuyerCriteria;
    const saved = more ? undefined : await findSavedBuyer();
    if (saved) c = { ...saved.criteria, minScore: Math.min(saved.criteria.minScore, 6) };
    else if (more && state.criteria) c = state.criteria;
    else {
      const f = criteriaFrom(slots, message);
      if (state.lastIntent === "match_buyer" && FOLLOW_UP.test(message.trim()) && state.criteria) {
        // Keep the earlier buyer; change only what this message states.
        const x = slots.filters;
        const changed: Partial<BuyerCriteria> = pickDefined({
          transactionType: x.transactionType,
          kinds: f.kinds,
          city: x.city,
          province: x.city ? undefined : x.province,
          budgetMax: f.budgetMax,
          minBedrooms: x.minBedrooms,
          features: f.features,
          purpose: f.purpose,
        });
        c = { ...state.criteria, ...changed, ...(x.city || x.province ? { locationImportance: state.criteria.locationImportance === "ignore" ? "important" : state.criteria.locationImportance } : {}) };
        if (x.city) c.province = undefined;
      } else c = f;
    }
    state.criteria = c;
    state.page = more ? (state.page ?? 0) + 1 : 0;
    const page = { limit: PAGE, offset: state.page * PAGE };
    const r = (await run("match.run", { criteria: c, page }, () => tools.match(c, page))) as Awaited<ReturnType<EngineTools["match"]>>;
    state.lastCodes = r.results.map((x) => x.listing.code);
    const what = [c.transactionType === "lease" ? "to rent" : "to buy", c.kinds.length ? c.kinds.join(", ").replace(/-/g, " ") : "", c.city ?? c.province ?? "", c.budgetMax ? `up to ${php(c.budgetMax)}` : "", c.minBedrooms ? `${c.minBedrooms}+ BR` : "", c.features.length ? c.features.join(", ").replace(/_/g, " ") : ""].filter(Boolean).join(" · ");
    if (!r.total) return out(`No listing scores ${c.minScore}+ for a buyer ${what}. ${r.excluded} were ruled out by a must-have (budget). Try a higher budget or another area, or open Buyer Matching to set each criterion's importance.`, "match_buyer");
    parts.push(`${pick(RESPONSES.matchIntro, seed)} buyer ${what}. **${r.total}** listing${r.total === 1 ? "" : "s"} score ${c.minScore}+.`, "");
    parts.push("| # | Score | Code | Listing | Price | Why |", "|---|---|---|---|---|---|");
    r.results.forEach((x, i) => {
      const why = x.match.parts.filter((p) => p.importance !== "ignore" && p.known).sort((a, b) => b.fit - a.fit).slice(0, 2).map((p) => p.reason).join("; ");
      parts.push(`| ${state.page! * PAGE + i + 1} | **${x.match.rating}/10** | ${x.listing.code} | ${cell(x.listing.name)} | ${priceOf(x.listing)} | ${cell(why)} |`);
    });
    if (r.excluded) parts.push("", `_${r.excluded} listing${r.excluded === 1 ? " was" : "s were"} ruled out by the budget (a must-have)._`);
    if (r.total > (state.page + 1) * PAGE) suggestions.push("show more");
    suggestions.push("details on #1", "how about in another city");
    return out(parts.join("\n"), "match_buyer");
  }

  async function affordTurn(loan: NonNullable<EngineState["loan"]>): Promise<EngineReply> {
    if (!loan.income) return ask("affordability", "What is the buyer's gross monthly income? (e.g. “₱80k”)");
    const term = loan.termYears ?? 20;
    const down = loan.downPct ?? 20;
    const dti = 35;
    const budget = (loan.income * dti) / 100;
    // Ask the lenders for their rates on a sample loan, then size the loan each rate allows.
    const args = { propertyPrice: 5_000_000, downPaymentPercent: down, termYears: term, fixYears: loan.fixYears ?? 3, lenderIds: loan.lenderIds };
    const r = (await run("lenders.compare", args, () => tools.compareLenders(args))) as { quotes: LenderQuote[] };
    const rows = r.quotes
      .filter((q) => q.ratePct !== null)
      .map((q) => {
        const i = q.ratePct! / 1200;
        const n = term * 12;
        const maxLoan = i ? (budget * (1 - Math.pow(1 + i, -n))) / i : budget * n;
        return { q, maxLoan, maxPrice: maxLoan / (1 - down / 100) };
      })
      .sort((a, b) => b.maxPrice - a.maxPrice)
      .slice(0, 5);
    if (!rows.length) return out("No lender rates are available to size the loan.");
    state.focusPrice = Math.round(rows[0]!.maxPrice / 10_000) * 10_000;
    suggestions.push(`find condos for sale under ${php(state.focusPrice)}`, "compare lenders for it");
    return out(
      [
        `With **${php(loan.income)}/month** income and a payment of at most ${dti}% of it (**${php(Math.round(budget))}/month**), ${down}% down, ${term} years:`,
        "",
        "| Lender | Rate | Max loan | Max price |",
        "|---|---|---|---|",
        ...rows.map((x) => `| ${cell(x.q.lender)} | ${x.q.ratePct}% (${cell(x.q.rateLabel)}) | ${php(Math.round(x.maxLoan))} | **${php(Math.round(x.maxPrice))}** |`),
        "",
        `_The ${dti}% share is a common rule of thumb, not a published lender rule; lenders also cap loans (Pag-IBIG ₱10M) and check age and credit._`,
      ].join("\n"),
      "affordability",
    );
  }
}

function listingTable(ls: ListingCard[], offset: number) {
  return ["| # | Code | Listing | Where | Price |", "|---|---|---|---|---|", ...ls.map((l, i) => `| ${offset + i + 1} | ${l.code} | ${cell(l.name)} | ${cell([l.city ?? l.province ?? "", sizeOf(l)].filter(Boolean).join(" · "))} | ${priceOf(l)} |`)].join("\n");
}

const pickDefined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) as Partial<T>;

const methodLabel = (d: EngineDoc) => ({ "pdf-text": "PDF text", "pdf-ocr": "scanned PDF, read with OCR", docx: "Word", "image-ocr": "image, read with OCR", text: "text" })[d.method] ?? d.method + (d.ocrConfidence !== null ? ` (OCR confidence ${d.ocrConfidence}%)` : "");

function factLines(f: DocFacts, datesOnly: boolean) {
  const out: string[] = [];
  if (f.dates.length) out.push("", `**Dates:** ${f.dates.join(" · ")}`);
  if (!datesOnly) {
    if (f.amounts.length) out.push(`**Amounts:** ${f.amounts.join(" · ")}`);
    if (f.areas.length) out.push(`**Areas:** ${f.areas.join(" · ")}`);
    if (f.titles.length) out.push(`**Title numbers:** ${f.titles.join(" · ")}`);
  }
  if (f.actions.length) out.push("", "**Obligations and to-dos:**", ...f.actions.slice(0, 6).map((a) => `- ${a}`));
  return out;
}

function extractActions(text: string) {
  return text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => /^(?:\[ \]|(?:todo|to do|follow up|call|send|email|schedule|submit|kailangan|dapat)\b)/i.test(l.replace(/^[-*•]\s*/, "")))
    .map((l) => l.replace(/^[-*•]\s*(\[ \]\s*)?/, ""))
    .filter((l) => l.length > 3 && l.length < 200);
}

/** Buyer criteria from a free-text request (used by "match a buyer…"). */
export function criteriaFrom(s: Slots, message: string): BuyerCriteria {
  const t = message.toLowerCase();
  const f = s.filters;
  const purpose = /\b(invest|rent(al)? income|rent out|paupahan|ipaupa)\b/.test(t) ? "rent_out" : /\b(business|office|shop|negosyo|store)\b/.test(t) ? "business" : /\b(land ?bank|develop)/.test(t) ? "land_bank" : /\b(farm|agri)/.test(t) ? "farm" : /\b(family|live|tirahan|titirhan|home)\b/.test(t) ? "live" : undefined;
  return {
    transactionType: f.transactionType ?? "sale",
    kinds: f.kind ? [f.kind] : f.propertyType === "commercial" ? ["any-commercial"] : f.propertyType === "industrial" ? ["any-industrial"] : f.propertyType === "residential" ? ["any-residential"] : [],
    kindImportance: "important",
    city: f.city,
    province: f.city ? undefined : f.province,
    region: undefined,
    locationImportance: f.city || f.province ? "important" : "ignore",
    budgetMin: f.minPrice,
    budgetMax: f.maxPrice ?? s.price,
    budgetImportance: "must",
    minBedrooms: f.minBedrooms,
    bedroomsImportance: "important",
    minAreaSqm: f.minAreaSqm,
    areaImportance: "nice",
    features: findFeatures(message).slice(0, 8),
    featuresImportance: "nice",
    purpose,
    purposeImportance: "important",
    minScore: 5,
  } as BuyerCriteria;
}

