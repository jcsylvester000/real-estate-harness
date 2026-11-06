"use client";
import { FileDown, Search, SlidersHorizontal, Star, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppFrame } from "@/components/apps/app-frame";
import { Chip, ListingCardView, ListingDrawer, placeText, priceText, sizeText } from "@/components/apps/listing-ui";
import { php } from "@/components/apps/result-view";
import { errText } from "@/components/apps/use-grid";
import { KINDS } from "@/lib/listings/kinds";
import type { GridSDK, IndexFacets, ListingCard, SearchInput, SearchResult } from "@/lib/sdk/types";

const EXAMPLES = ["2BR condo for rent in BGC under 60k", "commercial lot near C6", "house and lot in Parañaque", "residential lot in La Union under 1M", "warehouse for lease", "office space in Makati"];
const PAGE = 24;

const FIELD_LABEL: Partial<Record<keyof SearchInput, (f: SearchInput) => string>> = {
  transactionType: (f) => (f.transactionType === "lease" ? "For rent" : "For sale"),
  kind: (f) => KINDS[f.kind!]?.label ?? f.kind!,
  propertyType: (f) => f.propertyType!,
  city: (f) => f.city!,
  province: (f) => f.province!,
  minPrice: (f) => `From ${php(f.minPrice!)}`,
  maxPrice: (f) => `Up to ${php(f.maxPrice!)}${f.transactionType === "lease" ? "/mo" : ""}`,
  minBedrooms: (f) => `${f.minBedrooms}+ bedrooms`,
  minAreaSqm: (f) => `${f.minAreaSqm!.toLocaleString()}+ sqm`,
  maxAreaSqm: (f) => `Up to ${f.maxAreaSqm!.toLocaleString()} sqm`,
  query: (f) => `“${f.query}”`,
};
const SALE_BUDGETS = [3_000_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000, 100_000_000];
const RENT_BUDGETS = [20_000, 40_000, 60_000, 100_000, 200_000];

function Finder({ grid }: { grid: GridSDK }) {
  const [text, setText] = useState(typeof grid.launchArgs.q === "string" ? grid.launchArgs.q : "");
  const [filters, setFilters] = useState<SearchInput>({});
  const [sort, setSort] = useState<NonNullable<SearchInput["sort"]>>("relevance");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [items, setItems] = useState<ListingCard[]>([]);
  const [facets, setFacets] = useState<IndexFacets | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [shortlist, setShortlist] = useState<ListingCard[]>([]);
  const [showShort, setShowShort] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const closeDrawer = useCallback(() => setOpen(null), []);
  // Only the latest request may update the results (an older, slower one must not overwrite them).
  const seq = useRef(0);

  useEffect(() => {
    grid.listings.facets().then(setFacets).catch(() => {});
    grid.kv
      .get<ListingCard[]>("shortlist")
      .then((s) => Array.isArray(s) && setShortlist(s))
      .catch(() => {});
  }, [grid]);

  const run = useCallback(
    async (f: SearchInput, s = sort, offset = 0) => {
      const my = ++seq.current;
      setBusy(true);
      setError("");
      try {
        const r = await grid.listings.search({ ...f, sort: s, limit: PAGE, offset });
        if (my !== seq.current) return;
        setResult(r);
        setItems((prev) => (offset ? [...prev, ...r.listings] : r.listings));
      } catch (e) {
        setError(errText(e));
      } finally {
        setBusy(false);
      }
    },
    [grid, sort],
  );

  /** Free text → the server's no-AI parser → filters, then a normal filtered search. */
  const ask = useCallback(
    async (q: string) => {
      const t = q.trim();
      if (!t) return run({});
      const my = ++seq.current;
      setBusy(true);
      setError("");
      try {
        const r = await grid.listings.ask(t, { limit: PAGE, sort });
        if (my !== seq.current) return;
        setFilters(r.parsed.filters);
        setResult(r.result);
        setItems(r.result.listings);
      } catch (e) {
        setError(errText(e));
      } finally {
        setBusy(false);
      }
    },
    [grid, run, sort],
  );

  useEffect(() => {
    // First load: a launch query ("q") or the newest listings. State updates happen after the request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof grid.launchArgs.q === "string") ask(grid.launchArgs.q);
    else run({}, "newest");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);

  const setFilter = (patch: Partial<SearchInput>) => {
    const next = { ...filters, ...patch };
    for (const k of Object.keys(next) as (keyof SearchInput)[]) if (next[k] === undefined || next[k] === "") delete next[k];
    if (patch.kind) delete next.propertyType;
    if (patch.city) delete next.province;
    if (patch.province) delete next.city;
    setFilters(next);
    run(next);
  };
  const remove = (k: keyof SearchInput) => {
    const next = { ...filters };
    delete next[k];
    if (k === "minAreaSqm") delete next.maxAreaSqm;
    setFilters(next);
    run(next);
  };

  const saveShortlist = async (list: ListingCard[]) => {
    setShortlist(list);
    await grid.kv.set("shortlist", list.slice(0, 50)).catch(() => {});
  };
  const star = (l: ListingCard) => saveShortlist(shortlist.some((s) => s.code === l.code) ? shortlist.filter((s) => s.code !== l.code) : [...shortlist, l].slice(-50));
  const exportShortlist = async () => {
    const name = await grid.ui.prompt("Save the shortlist as", `/Deals/shortlist-${new Date().toISOString().slice(0, 10)}.md`);
    if (!name) return;
    const body = [
      `# Property shortlist`,
      "",
      `Prepared ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })} from the GRID listings index.`,
      "",
      "| Code | Listing | Where | Kind | Size | Price |",
      "|---|---|---|---|---|---|",
      ...shortlist.map((l) => `| ${l.code} | ${l.name.replace(/\|/g, "/")} | ${placeText(l)} | ${l.kindLabel} | ${sizeText(l) ?? ""} | ${priceText(l)} |`),
      "",
      "Prices and availability as listed; confirm with the listing broker before quoting a client.",
    ].join("\n");
    try {
      await grid.fs.write(name, body, { createParents: true });
      grid.ui.notify("Shortlist saved to Files.", { tone: "ok" });
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };

  const chips = useMemo(
    () =>
      (Object.keys(FIELD_LABEL) as (keyof SearchInput)[])
        .filter((k) => filters[k] !== undefined && !(k === "maxAreaSqm" && filters.minAreaSqm !== undefined))
        .map((k) => ({ k, label: FIELD_LABEL[k]!(filters) })),
    [filters],
  );
  const budgets = filters.transactionType === "lease" ? RENT_BUDGETS : SALE_BUDGETS;

  const sidebar = facets && (
    <div className="space-y-5 text-sm">
      <fieldset>
        <legend className="label">Looking to</legend>
        <div className="flex gap-1">
          {[
            [undefined, "Any"],
            ["sale", "Buy"],
            ["lease", "Rent"],
          ].map(([v, l]) => (
            <button key={l} type="button" aria-pressed={filters.transactionType === v} onClick={() => setFilter({ transactionType: v as SearchInput["transactionType"], maxPrice: undefined, minPrice: undefined })} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${filters.transactionType === v ? "border-navy bg-navy text-cream" : "border-line bg-white hover:bg-sand"}`}>
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="pf-kind" className="label">
          Property kind
        </label>
        <select id="pf-kind" className="field" value={filters.kind ?? ""} onChange={(e) => setFilter({ kind: e.target.value || undefined })}>
          <option value="">Any kind</option>
          {facets.byKind.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label} ({k.count})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="pf-city" className="label">
          City
        </label>
        <select id="pf-city" className="field" value={filters.city ?? ""} onChange={(e) => setFilter({ city: e.target.value || undefined })}>
          <option value="">Any city</option>
          {facets.byCity.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city} ({c.count})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="pf-prov" className="label">
          Province
        </label>
        <select id="pf-prov" className="field" value={filters.province ?? ""} onChange={(e) => setFilter({ province: e.target.value || undefined })}>
          <option value="">Any province</option>
          {facets.byProvince.map((p) => (
            <option key={p.value} value={p.value}>
              {p.value} ({p.count})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="pf-max" className="label">
          Budget {filters.transactionType === "lease" ? "(monthly rent)" : ""}
        </label>
        <select id="pf-max" className="field" value={filters.maxPrice ?? ""} onChange={(e) => setFilter({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">No limit</option>
          {[...new Set([...budgets, ...(filters.maxPrice ? [filters.maxPrice] : [])])]
            .sort((a, b) => a - b)
            .map((b) => (
              <option key={b} value={b}>
                Up to {php(b)}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label htmlFor="pf-beds" className="label">
          Bedrooms
        </label>
        <select id="pf-beds" className="field" value={filters.minBedrooms ?? ""} onChange={(e) => setFilter({ minBedrooms: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Any</option>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}+
            </option>
          ))}
        </select>
      </div>
      <p className="text-[11px] text-muted">{facets.totalAvailable.toLocaleString()} available listings in the index.</p>
    </div>
  );

  return (
    <div className="app-shell">
      <form
        className="border-b border-line bg-white p-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <div className="flex gap-2">
          <label htmlFor="pf-q" className="sr-only">
            What is the client looking for?
          </label>
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
            <input id="pf-q" value={text} onChange={(e) => setText(e.target.value)} placeholder="What is the client looking for? e.g. 2BR condo for rent in BGC under 60k" className="field h-11 pl-9" maxLength={300} />
          </div>
          <button type="submit" className="btn btn-dark h-11" disabled={busy}>
            Search
          </button>
          <button type="button" className="btn btn-ghost h-11 md:hidden" aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)} aria-label="Filters">
            <SlidersHorizontal size={16} aria-hidden />
          </button>
          <button type="button" className="btn btn-ghost h-11" aria-expanded={showShort} onClick={() => setShowShort((s) => !s)}>
            <Star size={15} aria-hidden /> <span className="hidden sm:inline">Shortlist</span> ({shortlist.length})
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {chips.length > 0 ? (
            <>
              <span className="text-[11px] text-muted">Searching for:</span>
              {chips.map((c) => (
                <button key={c.k} type="button" onClick={() => remove(c.k)} className="inline-flex items-center gap-1 rounded-full border border-bronze/40 bg-bronze-soft px-2.5 py-0.5 text-xs hover:border-bad hover:bg-bad-soft" aria-label={`Remove ${c.label}`}>
                  {c.label} <X size={11} aria-hidden />
                </button>
              ))}
              <button
                type="button"
                className="text-[11px] text-muted underline"
                onClick={() => {
                  setText("");
                  setFilters({});
                  run({}, "newest");
                }}
              >
                Clear all
              </button>
            </>
          ) : (
            <>
              <span className="text-[11px] text-muted">Try:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setText(ex);
                    ask(ex);
                  }}
                  className="rounded-full border border-line bg-cream px-2.5 py-0.5 text-xs hover:border-bronze"
                >
                  {ex}
                </button>
              ))}
            </>
          )}
        </div>
      </form>

      <div className="flex min-h-0 flex-1">
        <aside aria-label="Filters" className={`${showFilters ? "block" : "hidden"} w-60 shrink-0 overflow-auto border-r border-line bg-white p-4 md:block`}>
          {sidebar ?? <p className="text-sm text-muted">Loading filters…</p>}
        </aside>
        <section aria-label="Results" className="min-w-0 flex-1 overflow-auto p-4" aria-busy={busy}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="text-sm" role="status">
              {result ? (
                <>
                  <strong data-testid="result-count">{result.total.toLocaleString()}</strong> listing{result.total === 1 ? "" : "s"}
                  {result.matchMode === "partial" && <span className="text-muted"> (close matches)</span>}
                </>
              ) : busy ? (
                "Searching…"
              ) : null}
            </p>
            <label htmlFor="pf-sort" className="ml-auto text-xs text-muted">
              Sort
            </label>
            <select
              id="pf-sort"
              className="field h-8 w-auto py-0 text-xs"
              value={sort}
              onChange={(e) => {
                const s = e.target.value as NonNullable<SearchInput["sort"]>;
                setSort(s);
                run(filters, s);
              }}
            >
              <option value="relevance">Best match</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="newest">Newest</option>
            </select>
          </div>
          {result?.notes.map((n) => (
            <p key={n} className="mb-2 rounded-lg bg-info-soft px-3 py-2 text-xs text-info">
              {n}
            </p>
          ))}
          {error && (
            <p role="alert" className="mb-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
              {error}
            </p>
          )}
          {result && result.total === 0 && !busy && (
            <div className="card p-6 text-center text-sm">
              <p className="font-medium">No listing matches all of that.</p>
              <p className="mt-1 text-muted">Remove a filter above (click it), raise the budget, or try a nearby city.</p>
            </div>
          )}
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
            {items.map((l) => (
              <ListingCardView key={l.code} l={l} onOpen={() => setOpen(l.code)} starred={shortlist.some((s) => s.code === l.code)} onStar={() => star(l)} />
            ))}
          </div>
          {result && items.length < result.total && (
            <div className="mt-4 text-center">
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => run(filters, sort, items.length)}>
                Show more ({(result.total - items.length).toLocaleString()} left)
              </button>
            </div>
          )}
          {items.some((l) => l.kindInferred) && <p className="mt-4 text-[11px] text-muted">* Kind guessed from the listing name because the source did not state it.</p>}
        </section>

        {showShort && (
          <aside aria-label="Shortlist" className="w-72 shrink-0 overflow-auto border-l border-line bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-sans text-sm font-semibold">Shortlist</h2>
              <button type="button" aria-label="Close shortlist" onClick={() => setShowShort(false)} className="grid size-7 place-items-center rounded hover:bg-sand">
                <X size={14} />
              </button>
            </div>
            {shortlist.length === 0 && <p className="text-xs text-muted">Star listings to collect them here.</p>}
            <ul className="space-y-2">
              {shortlist.map((l) => (
                <li key={l.code} className="rounded-lg border border-line p-2 text-xs">
                  <button type="button" onClick={() => setOpen(l.code)} className="block w-full text-left">
                    <span className="block font-medium">{l.name}</span>
                    <span className="text-muted">
                      {priceText(l)} · {placeText(l)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {shortlist.length > 0 && (
              <div className="mt-3 flex gap-2">
                <button type="button" className="btn btn-dark min-h-8 flex-1 px-2 text-xs" onClick={exportShortlist}>
                  <FileDown size={13} aria-hidden /> Save to Files
                </button>
                <button type="button" className="btn btn-ghost min-h-8 px-2 text-xs" aria-label="Clear shortlist" onClick={() => saveShortlist([])}>
                  <Trash2 size={13} aria-hidden />
                </button>
              </div>
            )}
            <Chip tone="info">Saved on your account</Chip>
          </aside>
        )}
      </div>
      {open && <ListingDrawer grid={grid} code={open} onClose={closeDrawer} />}
    </div>
  );
}

export default function PropertyFinderPage() {
  return <AppFrame>{(grid) => <Finder grid={grid} />}</AppFrame>;
}
