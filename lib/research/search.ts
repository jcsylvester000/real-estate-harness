/**
 * Web search for research, with the backend chosen by what the server has:
 *   BRAVE_SEARCH_API_KEY → Brave Search API · TAVILY_API_KEY → Tavily · SEARXNG_URL → your SearXNG ·
 *   otherwise DuckDuckGo's HTML results (no key; fine for light use, may be rate limited).
 * Results come back as {title, url, snippet}; official Philippine sources are ranked first.
 */
import { decode } from "./page";
import { safeFetch } from "./fetch";
import { publisherOf, TIER_RANK } from "./sources";

export interface Hit {
  title: string;
  url: string;
  snippet: string;
  published?: string | null;
}

export type Backend = "brave" | "tavily" | "searxng" | "duckduckgo";
export const searchBackend = (): Backend => (process.env.BRAVE_SEARCH_API_KEY ? "brave" : process.env.TAVILY_API_KEY ? "tavily" : process.env.SEARXNG_URL ? "searxng" : "duckduckgo");

const strip = (s: string) => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/** Parses DuckDuckGo's no-JavaScript results page. */
export function parseDuckDuckGo(html: string): Hit[] {
  const out: Hit[] = [];
  const blocks = html.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/).slice(1);
  for (const b of blocks) {
    const a = b.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    let href = decode(a[1]!);
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]!);
    if (href.startsWith("//")) href = `https:${href}`;
    if (!/^https?:\/\//.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue;
    const sn = b.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(a|div|td)>/);
    out.push({ title: strip(a[2]!), url: href, snippet: sn ? strip(sn[1]!) : "" });
  }
  return out;
}

async function json(url: string, init: { headers?: Record<string, string>; method?: string; body?: string } = {}) {
  const r = await safeFetch(url, { accept: "application/json", maxBytes: 2_000_000, timeoutMs: 8000, ...init });
  if (r.status >= 400) throw new Error(`Search service answered HTTP ${r.status}.`);
  return JSON.parse(r.body.toString("utf8"));
}

export async function webSearch(query: string, opts: { sites?: string[]; max?: number } = {}): Promise<{ backend: Backend; hits: Hit[] }> {
  const max = Math.min(10, opts.max ?? 6);
  const siteQ = opts.sites?.length ? ` (${opts.sites.slice(0, 6).map((s) => `site:${s}`).join(" OR ")})` : "";
  const q = `${query}${siteQ}`.slice(0, 380);
  const backend = searchBackend();
  let hits: Hit[] = [];
  if (backend === "brave") {
    const j = await json(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${max}&country=PH`, { headers: { "x-subscription-token": process.env.BRAVE_SEARCH_API_KEY! } });
    hits = ((j.web?.results ?? []) as { title: string; url: string; description?: string; page_age?: string }[]).map((r) => ({ title: strip(r.title), url: r.url, snippet: strip(r.description ?? ""), published: r.page_age?.slice(0, 10) ?? null }));
  } else if (backend === "tavily") {
    const j = await json("https://api.tavily.com/search", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.TAVILY_API_KEY}` }, body: JSON.stringify({ query: q, max_results: max, search_depth: "basic", include_domains: opts.sites?.length ? opts.sites : undefined }) });
    hits = ((j.results ?? []) as { title: string; url: string; content?: string; published_date?: string }[]).map((r) => ({ title: r.title, url: r.url, snippet: (r.content ?? "").slice(0, 400), published: r.published_date?.slice(0, 10) ?? null }));
  } else if (backend === "searxng") {
    const base = process.env.SEARXNG_URL!.replace(/\/$/, "");
    const j = await json(`${base}/search?q=${encodeURIComponent(q)}&format=json&language=en-PH`);
    hits = ((j.results ?? []) as { title: string; url: string; content?: string; publishedDate?: string }[]).map((r) => ({ title: r.title, url: r.url, snippet: (r.content ?? "").slice(0, 400), published: r.publishedDate?.slice(0, 10) ?? null }));
  } else {
    const r = await safeFetch("https://html.duckduckgo.com/html/", { method: "POST", body: `q=${encodeURIComponent(q)}&kl=ph-en`, headers: { "content-type": "application/x-www-form-urlencoded" }, timeoutMs: 8000, maxBytes: 1_500_000 });
    hits = parseDuckDuckGo(r.body.toString("utf8"));
    if (!hits.length && /anomaly|captcha/i.test(r.body.toString("utf8"))) throw new Error("The free search service is busy. Ask the admin to set BRAVE_SEARCH_API_KEY or TAVILY_API_KEY for reliable research.");
  }
  // Official first, then research, news, portals; keep the engine's order within a tier.
  const seen = new Set<string>();
  hits = hits.filter((h) => (seen.has(h.url) ? false : (seen.add(h.url), true)));
  hits = hits.map((h, i) => ({ h, i, t: TIER_RANK[publisherOf(h.url).tier] })).sort((a, b) => a.t - b.t || a.i - b.i).map((x) => x.h);
  return { backend, hits: hits.slice(0, max) };
}
