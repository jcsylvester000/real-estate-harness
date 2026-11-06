/**
 * The source ledger: every page or brief the research harness looks at gets a number (S1, S2…) that the
 * model cites as [S1]. After the turn the harness checks the reply: which sources were cited, citations
 * that point nowhere, and links the model wrote that it never opened. Kept per conversation so
 * follow-up questions can cite earlier sources.
 */
import { publisherOf, type Tier } from "./sources";

export interface Source {
  id: string;
  url: string;
  title: string;
  publisher: string;
  tier: Tier;
  /** Page date if the page states one (YYYY-MM-DD). */
  published: string | null;
  /** When the harness read it (ISO). */
  retrievedAt: string;
  /** read = the page text was read; search = only the search snippet was seen; brief = a built-in brief. */
  via: "read" | "search" | "brief";
  snippet?: string;
}

export interface SourceCheck {
  cited: Source[];
  /** Read but not cited (shown as "also consulted"). */
  consulted: Source[];
  /** [S9] with no S9. */
  unknownCitations: string[];
  /** Links in the reply that the harness never retrieved. */
  unverifiedLinks: string[];
}

export const normUrl = (u: string) => {
  try {
    const x = new URL(u);
    x.hash = "";
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/.test(k)) x.searchParams.delete(k);
    return `${x.protocol}//${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/$/, "")}${x.search}`;
  } catch {
    return u.trim();
  }
};

export class SourceLedger {
  private list: Source[] = [];
  constructor(saved: Source[] = []) {
    this.list = saved.slice(-60);
  }
  get all() {
    return this.list;
  }
  find(url: string) {
    const n = normUrl(url);
    return this.list.find((s) => normUrl(s.url) === n);
  }
  get(id: string) {
    return this.list.find((s) => s.id === id);
  }
  /** Adds or upgrades (a search hit later read in full becomes "read"). Returns the source with its id. */
  add(s: Omit<Source, "id" | "publisher" | "tier" | "retrievedAt"> & { publisher?: string; tier?: Tier; retrievedAt?: string }): Source {
    const have = this.find(s.url);
    if (have) {
      if (s.via === "read" && have.via !== "read") Object.assign(have, { via: "read", title: s.title || have.title, published: s.published ?? have.published, retrievedAt: new Date().toISOString() });
      return have;
    }
    const pub = publisherOf(s.url);
    const max = this.list.reduce((m, x) => Math.max(m, Number(x.id.slice(1)) || 0), 0);
    const src: Source = { ...s, id: `S${max + 1}`, publisher: s.publisher || pub.name, tier: s.tier ?? pub.tier, retrievedAt: s.retrievedAt ?? new Date().toISOString(), title: (s.title || pub.name).slice(0, 200) };
    this.list.push(src);
    return src;
  }
  check(reply: string): SourceCheck {
    const ids = [...new Set([...reply.matchAll(/\[(S\d{1,3})(?:\s*[,;]\s*S\d{1,3})*\]/g)].flatMap((m) => m[0].match(/S\d{1,3}/g) ?? []))];
    const cited = ids.map((id) => this.get(id)).filter((x): x is Source => !!x);
    const unknownCitations = ids.filter((id) => !this.get(id));
    const links = [...reply.matchAll(/https?:\/\/[^\s)\]>"'`]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ""));
    const unverifiedLinks = [...new Set(links.filter((l) => !this.find(l)))];
    const consulted = this.list.filter((s) => s.via === "read" && !cited.includes(s));
    return { cited, consulted, unknownCitations, unverifiedLinks };
  }
}
