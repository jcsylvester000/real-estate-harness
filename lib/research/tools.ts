/**
 * Research tools for the PH Real Estate Research Harness. Every tool registers what it looked at in the
 * SourceLedger and returns source ids, so the model can cite [S1] and the harness can check the citations.
 */
import type { HarnessTool } from "@/lib/harness";
import { BRIEFS, BRIEF_IDS, briefById } from "./briefs";
import { FetchError, safeFetch } from "./fetch";
import type { SourceLedger } from "./ledger";
import { extract, passages, type PageText } from "./page";
import { webSearch } from "./search";
import { PUBLISHERS, publisherOf, sitesFor, TIER_LABEL, type Topic } from "./sources";

const TOPICS: Topic[] = ["zonal", "tax", "filing", "law", "market", "property", "developer", "financing", "land", "local"];
const FOCUS = ["official", "industry", "news", "any"] as const;

// Pages are cached briefly per server instance: follow-ups re-read the same pages for free.
const cache = new Map<string, { at: number; page: PageText; url: string }>();
async function readPage(url: string) {
  const c = cache.get(url);
  if (c && Date.now() - c.at < 15 * 60_000) return c;
  const f = await safeFetch(url, { maxBytes: 8_000_000, timeoutMs: 10_000 });
  if (f.status >= 400) throw new FetchError(`The site answered HTTP ${f.status}.`);
  const page = await extract(f);
  const v = { at: Date.now(), page, url: f.url };
  cache.set(url, v);
  if (cache.size > 80) cache.delete(cache.keys().next().value!);
  return v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function researchTools(ledger: SourceLedger, now = () => new Date()): HarnessTool<any>[] {
  const briefTool: HarnessTool<{ topic: string }> = {
    definition: {
      name: "ph_research_brief",
      description:
        "Start here for Philippine real estate topics. Returns what a broker should know with sources and dates, what to verify live, and good search queries. Topics: zonal_values (BIR zonal values, RA 12001 market values), sale_taxes (CGT, DST, CWT, VAT, transfer tax), bir_filing (forms 1706, 2000-OT, 1606, ONETT/eCAR, deadlines), market_data (price indices, consultancies, developer disclosures), due_diligence (title, taxes, DHSUD license to sell, zoning).",
      parameters: { type: "object", properties: { topic: { type: "string", enum: BRIEF_IDS } }, required: ["topic"] },
    },
    run: ({ topic }) => {
      const b = briefById(topic)!;
      const ids = b.sources.map((s) => ledger.add({ url: s.url, title: s.title, published: null, via: "brief", retrievedAt: `${s.asOf}T00:00:00.000Z` }).id);
      return {
        title: b.title,
        points: b.points.map((p) => `${p.text} ${p.src.map((i) => `[${ids[i]}]`).join("")}`),
        verify_live: b.verify,
        suggested_queries: b.queries,
        sources: b.sources.map((s, i) => ({ id: ids[i], title: s.title, url: s.url, checked: s.asOf })),
        note: `These points were last checked on the dates shown. Today is ${now().toISOString().slice(0, 10)}: verify anything that may have changed with web_search and read_source before relying on it.`,
      };
    },
  };

  const sourcesTool: HarnessTool<{ topic: string }> = {
    definition: {
      name: "list_ph_sources",
      description: "Lists trusted Philippine sources for a topic (government first, then research firms, news, portals), with what each covers.",
      parameters: { type: "object", properties: { topic: { type: "string", enum: TOPICS } }, required: ["topic"] },
    },
    run: ({ topic }) =>
      PUBLISHERS.filter((p) => p.topics.includes(topic as Topic)).map((p) => ({ name: p.name, site: p.domain, kind: TIER_LABEL[p.tier], covers: p.covers, start: p.start })),
  };

  const searchTool: HarnessTool<{ query: string; focus?: (typeof FOCUS)[number]; site?: string; topic?: string }> = {
    definition: {
      name: "web_search",
      description:
        "Searches the web. Use focus 'official' for laws, taxes, zonal values and filings (searches government sites), 'industry' for market data (consultancies, banks), 'news' for recent events, 'any' otherwise. Returns numbered sources [S#] with snippets; read the most relevant ones with read_source before citing specific figures.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Specific query, e.g. 'BIR zonal value Barangay San Antonio Pasig RDO 43' or 'Colliers Philippines residential Q3 2026'." },
          focus: { type: "string", enum: [...FOCUS] },
          topic: { type: "string", enum: TOPICS, description: "Narrows 'official' or 'industry' searches to the right agencies or firms." },
          site: { type: "string", description: "Limit to one site, e.g. bir.gov.ph" },
        },
        required: ["query"],
      },
    },
    run: async ({ query, focus = "any", site, topic }) => {
      const t = (topic as Topic | undefined) ?? (/zonal/i.test(query) ? "zonal" : /tax|bir|cgt|dst|vat/i.test(query) ? "tax" : "market");
      const sites = site ? [site.replace(/^https?:\/\//, "").replace(/\/.*$/, "")] : focus === "official" ? sitesFor(t, ["official"]).slice(0, 5) : focus === "industry" ? sitesFor("market", ["research"]).slice(0, 6) : focus === "news" ? sitesFor(t, ["news"]).slice(0, 6) : undefined;
      let r = await webSearch(query, { sites, max: 6 });
      // A narrow official search can come back empty; widen once.
      if (!r.hits.length && sites) r = await webSearch(focus === "official" ? `${query} Philippines` : query, { max: 6 });
      return {
        results: r.hits.map((h) => {
          const s = ledger.add({ url: h.url, title: h.title, published: h.published ?? null, via: "search", snippet: h.snippet });
          return { id: s.id, title: h.title, publisher: s.publisher, kind: TIER_LABEL[s.tier], url: h.url, snippet: h.snippet, date: h.published ?? undefined };
        }),
        searched_with: r.backend,
        tip: r.hits.length ? "Read the official or most specific result before quoting numbers." : "No results. Try a shorter query, a different place spelling, or focus 'any'.",
      };
    },
  };

  const readTool: HarnessTool<{ source: string; question?: string }> = {
    definition: {
      name: "read_source",
      description: "Reads a web page or PDF (by source id like S3, or a URL) and returns the passages relevant to your question, with the page's title, publisher and date. Cite what you use as [S#].",
      parameters: {
        type: "object",
        properties: { source: { type: "string", description: "A source id from web_search (S3) or a full https URL." }, question: { type: "string", description: "What you need from the page; used to pick the relevant passages." } },
        required: ["source"],
      },
    },
    run: async ({ source, question = "" }) => {
      const known = /^S\d+$/i.test(source.trim()) ? ledger.get(source.trim().toUpperCase()) : undefined;
      const url = known?.url ?? source.trim();
      if (!/^https?:\/\//i.test(url)) return { error: `Unknown source "${source}". Use an id from web_search or a full URL.` };
      try {
        const { page, url: finalUrl } = await readPage(url);
        const s = ledger.add({ url, title: page.title || known?.title || publisherOf(finalUrl).name, published: page.published, via: "read" });
        const p = passages(page.text, `${question} ${known?.snippet ?? ""}`, 5000);
        return {
          id: s.id,
          title: s.title,
          publisher: s.publisher,
          kind: TIER_LABEL[s.tier],
          page_date: page.published ?? "not stated",
          format: page.kind === "pdf" ? `PDF, ${page.pages} pages` : "web page",
          text: p.text || "(no readable text: the page may need JavaScript or be a scanned image)",
          excerpt_only: p.truncated,
        };
      } catch (e) {
        return { error: `Could not read ${url}: ${(e as Error).message}`, tip: "Try another result, or the publisher's main page for the same document." };
      }
    },
  };

  const zonalTool: HarnessTool<{ place: string; street?: string; building?: string; classification?: string }> = {
    definition: {
      name: "find_zonal_value",
      description:
        "Finds BIR zonal value schedules for a location: searches the BIR and zonal-value sites for the city/barangay, street, subdivision or condominium. Returns sources to read. Report the value per sqm, classification, RDO, Department Order and effectivity date as stated in the schedule.",
      parameters: {
        type: "object",
        properties: {
          place: { type: "string", description: "Barangay and city or municipality, e.g. 'San Antonio, Pasig City'." },
          street: { type: "string", description: "Street, subdivision or village." },
          building: { type: "string", description: "Condominium building name, if a condo." },
          classification: { type: "string", description: "RR residential, CR commercial, CC condo commercial, RC residential condo, A agricultural… if known." },
        },
        required: ["place"],
      },
    },
    run: async ({ place, street, building, classification }) => {
      const what = [building, street, place].filter(Boolean).join(" ");
      const [official, copies] = await Promise.all([
        webSearch(`zonal value ${place} revenue district office department order`, { sites: ["bir.gov.ph"], max: 4 }).catch(() => ({ hits: [] })),
        webSearch(`BIR zonal value ${what} ${classification ?? ""}`.trim(), { max: 6 }).catch(() => ({ hits: [] })),
      ]);
      const res = [...official.hits, ...copies.hits].map((h) => {
        const s = ledger.add({ url: h.url, title: h.title, published: h.published ?? null, via: "search", snippet: h.snippet });
        return { id: s.id, title: h.title, publisher: s.publisher, kind: TIER_LABEL[s.tier], url: h.url, snippet: h.snippet };
      });
      const brief = BRIEFS[0]!;
      const bid = ledger.add({ url: brief.sources[4]!.url, title: brief.sources[4]!.title, published: "2026-05-05", via: "brief" }).id;
      return {
        results: res,
        how_to_report: "Give the zonal value per sqm, the classification, the RDO, and the Department Order number and effectivity date from the schedule you read. If only a third-party copy was found, say so and advise confirming on the BIR schedule or with the RDO (a Certificate of Zonal Value can be requested).",
        context: `Zonal values remain in force while the BIR has suspended revisions ahead of RA 12001's market-value system (target 2028) [${bid}].`,
      };
    },
  };

  return [briefTool, sourcesTool, searchTool, readTool, zonalTool];
}
