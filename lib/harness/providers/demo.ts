// Demo adapter: a keyword-routed stand-in for a real model, so the desktop works with no API key
// (offline demos, end-to-end tests). It calls the same harness tools as a real model and only
// reports figures those tools return. It is not an AI and says so in every reply.

import { parseInquiry } from "@/lib/listings/inquiry";
import type { ChatMessage, ModelProvider, ModelRequest, ModelResponse, ToolCall } from "../harness/types";

const NO_USAGE = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
const php = (n: unknown) => (typeof n === "number" ? `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}` : "n/a");

/** "₱7.6M", "7,600,000", "8 million", "500k" → pesos. Returns all amounts in order. */
export function parseAmounts(text: string): number[] {
  const out: number[] = [];
  const re = /(?:₱|php|p)?\s*(\d+(?:[.,]\d+)*)\s*(m\b|million|k\b|thousand)?/gi;
  for (const m of text.matchAll(re)) {
    const raw = m[1]!;
    const unit = (m[2] ?? "").toLowerCase();
    const n = Number(unit ? raw.replace(/,/g, "") : raw.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const v = unit.startsWith("m") ? n * 1_000_000 : unit.startsWith("k") || unit === "thousand" ? n * 1_000 : n;
    out.push(v);
  }
  return out;
}

const percent = (text: string, fallback: number) => {
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : fallback;
};
const percents = (text: string) => [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m => Number(m[1]));
const bigAmount = (text: string) => parseAmounts(text.replace(/\d+(?:\.\d+)?\s*%/g, "")).filter(n => n >= 100_000).sort((a, b) => b - a)[0];

/** Picks one tool call for a user message, or null when no tool fits. */
export function routeMessage(text: string): Omit<ToolCall, "id"> | null {
  const t = text.toLowerCase();
  const price = bigAmount(text);
  if (/foreign|japanese|american|korean|chinese|expat|non-filipino|foreigner/.test(t)) {
    const propertyType = /condo/.test(t) ? "condominium" : /lease|rent/.test(t) ? "lease" : /house/.test(t) ? "house_and_lot" : "land";
    return { name: "check_foreign_ownership", arguments: { buyerType: "foreign_individual", propertyType } };
  }
  if (/maceda|refund|wants out|cancel/.test(t)) {
    const years = Number(t.match(/(\d+)\s*(?:years?|yrs?)/)?.[1] ?? 2);
    const paid = parseAmounts(text).filter(n => n >= 10_000).sort((a, b) => b - a)[0] ?? 0;
    return { name: "compute_maceda_refund", arguments: { totalPaymentsMade: paid, yearsOfInstallmentsPaid: years } };
  }
  if (/commission/.test(t) && price) return { name: "compute_commission", arguments: { salePrice: price, commissionRatePercent: percent(text, 5) } };
  if (/monthly|amorti|loan|mortgage|pag-ibig|pagibig/.test(t) && price) {
    const ps = percents(text);
    const years = Number(t.match(/(\d+)\s*(?:years?|yrs?)/)?.[1] ?? 20);
    return {
      name: "compute_loan_amortization",
      arguments: { propertyPrice: price, downPaymentPercent: ps[0] ?? 20, annualInterestRatePercent: ps[1] ?? 7, termYears: years, lender: /pag-?ibig/.test(t) ? "pagibig" : "bank" },
    };
  }
  if (/\b(cost|costs|tax|taxes|cgt|dst|closing|transfer tax|fees)\b/.test(t) && price) {
    return { name: "compute_acquisition_costs", arguments: { sellingPrice: price, lguType: /province|cavite|laguna|batangas|bulacan|pampanga|rizal|la union|benguet|cebu/.test(t) ? "province" : "city_or_metro_manila" } };
  }
  if (/\b(how many|what (do|does) (we|grid) have|inventory overview|overview|summary of (the )?(listings|inventory)|listings index)\b/.test(t)) {
    return { name: "get_listing_index", arguments: {} };
  }
  const code = text.match(/\b(GRID[_-][A-Z0-9-]{3,}|DEMO-\d{3})\b/i)?.[1];
  if (code) return { name: "get_listing", arguments: { code: code.toUpperCase() } };
  const parsed = parseInquiry(text);
  const f = parsed.filters;
  const listingIntent = /\b(listings?|find|show|looking|search|available|for sale|for rent|rent|lease|condos?|house|lots?|warehouse|office|townhouse|building|property|properties)\b|\d\s*br\b|bedroom/.test(t);
  if (listingIntent || f.city || f.province || f.kind) {
    return { name: "search_listings", arguments: { ...f, limit: 5 } };
  }
  return null;
}

/** Plain-language summary of one tool result, using only the tool's own numbers. */
export function summarize(name: string, result: any): string {
  if (result?.error) return `The calculator could not run: ${result.error}`;
  switch (name) {
    case "compute_acquisition_costs":
      return [
        `Tax base: ${php(result.taxBase)} (${result.taxBaseSource}).`,
        "",
        "| Item | Payer | Amount |",
        "|---|---|---|",
        ...result.items.map((i: any) => `| ${i.item} | ${i.payer} | ${php(i.amount)}${i.isEstimate ? " (est.)" : ""} |`),
        "",
        `Buyer total ${php(result.totals.buyer)}; seller total ${php(result.totals.seller)}.`,
      ].join("\n");
    case "compute_loan_amortization":
      return `Monthly payment ${php(result.monthlyPayment)} on a loan of ${php(result.loanAmount)} over ${result.months} months (down payment ${php(result.downPayment)}; total interest ${php(result.totalInterest)}).${result.warnings?.length ? `\n\nNotes: ${result.warnings.join(" ")}` : ""}`;
    case "compute_commission":
      return `Gross commission ${php(result.grossCommission)}; VAT ${php(result.vat)}; withholding ${php(result.withholdingTax)} (${result.withholdingRatePercent}%); net cash received ${php(result.netCashReceived)}.`;
    case "compute_maceda_refund":
      return result.covered === false ? result.explanation : `Cash surrender value ${php(result.cashSurrenderValue)} (${result.refundPercent}% of payments). Grace period: ${result.gracePeriod}. Basis: ${result.basis}.`;
    case "check_foreign_ownership":
      return `Verdict: ${String(result.verdict).replace(/_/g, " ")}. ${(result.conditions ?? []).join(" ")} Basis: ${(result.basis ?? []).join(", ")}.`;
    case "search_listings": {
      const notes = (result.notes ?? []).filter((n: string) => !/Do not invent/.test(n));
      if (!result.total) return ["No listing in the index matches that.", ...notes, "Try fewer filters, a nearby city, or a higher budget. Property Finder shows what is available."].join(" ");
      const rows = result.listings.map((l: any) => {
        const price = l.monthlyRentPhp !== undefined ? `${php(l.monthlyRentPhp)}/mo` : php(l.pricePhp);
        const size = l.floorAreaSqm ? `${l.floorAreaSqm} sqm` : l.lotAreaSqm ? `${l.lotAreaSqm} sqm lot` : "";
        return `| ${l.code} | ${String(l.name).replace(/\|/g, "/")} | ${[l.city ?? l.province ?? "", size].filter(Boolean).join(" · ")} | ${price} |`;
      });
      return [
        `${result.total} listing${result.total === 1 ? "" : "s"} match${result.total === 1 ? "es" : ""}${result.total > rows.length ? `; the ${rows.length} best:` : ":"}`,
        "",
        "| Code | Listing | Where | Price |",
        "|---|---|---|---|",
        ...rows,
        ...(notes.length ? ["", ...notes.map((n: string) => `_${n}_`)] : []),
      ].join("\n");
    }
    case "get_listing_index": {
      const top = (result.byCity ?? []).slice(0, 8).map((c: any) => `${c.city} (${c.count})`).join(", ");
      const kinds = (result.byKind ?? []).slice(0, 6).map((k: any) => `${k.label} (${k.count})`).join(", ");
      const tx = (result.byTransaction ?? []).map((x: any) => `${x.count} for ${x.value === "lease" ? "rent" : "sale"}`).join(", ");
      return [`GRID has **${result.totalAvailable} available listings**${tx ? ` (${tx})` : ""}.`, kinds && `Most common: ${kinds}.`, top && `Top cities: ${top}.`].filter(Boolean).join("\n\n");
    }
    case "get_listing": {
      if (result.error) return result.error;
      const price = result.monthlyRentPhp !== undefined ? `${php(result.monthlyRentPhp)} per month` : php(result.pricePhp);
      return [`**${result.code} · ${result.name}**`, "", `- ${result.kind}, for ${result.transaction === "lease" ? "rent" : "sale"}: ${price}`, `- ${result.location}`, result.bedrooms !== null && result.bedrooms !== undefined ? `- Bedrooms: ${result.bedrooms}` : "", result.floorAreaSqm ? `- Floor area: ${result.floorAreaSqm} sqm` : "", result.lotAreaSqm ? `- Lot area: ${result.lotAreaSqm} sqm` : ""].filter(Boolean).join("\n");
    }
    default:
      return "```json\n" + JSON.stringify(result, null, 2).slice(0, 1500) + "\n```";
  }
}

export class DemoProvider implements ModelProvider {
  readonly id = "demo" as const;
  readonly model = "grid-demo";

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const msgs: ChatMessage[] = req.messages;
    const last = msgs[msgs.length - 1];
    if (last?.role === "tool") {
      const results: string[] = [];
      for (let i = msgs.length - 1; i >= 0 && msgs[i]!.role === "tool"; i--) {
        const m = msgs[i] as Extract<ChatMessage, { role: "tool" }>;
        results.unshift(summarize(m.name, JSON.parse(m.content)));
      }
      return { text: `${results.join("\n\n")}\n\n_Smart search mode (no AI key): assembled from GRID's calculators and listings index, not written by an AI. A licensed broker should review before sending to a client._`, toolCalls: [], usage: NO_USAGE, stopReason: "end_turn" };
    }
    const userText = last?.role === "user" ? last.content : "";
    const call = routeMessage(userText);
    if (!call) {
      return {
        text: "No AI key is set, so I work in **smart search mode**: I run GRID's calculators and search the listings index, but I cannot hold a free conversation. Try “2BR condo for rent in BGC under 60k”, “commercial lot near C6”, “How many listings do we have?”, “Cost to buy a ₱7.6M condo in Pasig”, “Monthly payment on ₱7.6M, 20% down, 7%, 20 years” or “Can a Japanese client buy a condo?”.",
        toolCalls: [],
        usage: NO_USAGE,
        stopReason: "end_turn",
      };
    }
    return { text: "", toolCalls: [{ id: `demo-${Date.now()}`, ...call }], usage: NO_USAGE, stopReason: "tool_use" };
  }
}
