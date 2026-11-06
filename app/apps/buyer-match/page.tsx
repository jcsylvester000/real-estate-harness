"use client";
import { ArrowLeft, ChevronDown, Pencil, Save, Trash2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppFrame } from "@/components/apps/app-frame";
import { Chip, ListingDrawer, placeText, priceText, sizeText } from "@/components/apps/listing-ui";
import { MatchBreakdown, ScoreBadge, scoreWord } from "@/components/apps/match-ui";
import { php } from "@/components/apps/result-view";
import { errText } from "@/components/apps/use-grid";
import { FEATURES, PURPOSES, REGIONS } from "@/lib/listings/analyze";
import { KINDS } from "@/lib/listings/kinds";
import { KIND_GROUPS } from "@/lib/listings/match";
import type { BuyerCriteria, BuyerSummary, GridSDK, IndexFacets, MatchedListing } from "@/lib/sdk/types";

type Imp = "must" | "important" | "nice" | "ignore";
const PAGE = 24;
const SALE = [2e6, 3e6, 5e6, 8e6, 10e6, 15e6, 20e6, 30e6, 50e6, 100e6, 300e6];
const RENT = [15e3, 25e3, 40e3, 60e3, 80e3, 100e3, 150e3, 250e3, 500e3];
const SIZES = [30, 50, 80, 120, 200, 300, 500, 1000, 5000, 10000];

const DEFAULT: BuyerCriteria = {
  transactionType: "sale",
  kinds: [],
  kindImportance: "important",
  locationImportance: "important",
  budgetImportance: "must",
  bedroomsImportance: "important",
  areaImportance: "nice",
  features: [],
  featuresImportance: "nice",
  purposeImportance: "important",
  minScore: 6,
};

function ImportanceSelect({ id, value, onChange }: { id: string; value: Imp; onChange: (v: Imp) => void }) {
  return (
    <select id={id} aria-label="Importance" value={value} onChange={(e) => onChange(e.target.value as Imp)} className="h-7 rounded-md border border-line-2 bg-sand px-1.5 text-[11px] font-medium">
      <option value="must">Must have</option>
      <option value="important">Important</option>
      <option value="nice">Nice to have</option>
      <option value="ignore">Doesn&apos;t matter</option>
    </select>
  );
}

function Row({ label, htmlFor, imp, children }: { label: string; htmlFor: string; imp?: { id: string; value: Imp; onChange: (v: Imp) => void }; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-semibold text-ink-2">
          {label}
        </label>
        {imp && <ImportanceSelect {...imp} />}
      </div>
      {children}
    </div>
  );
}

function CriteriaForm({ c, set, facets }: { c: BuyerCriteria; set: (p: Partial<BuyerCriteria>) => void; facets: IndexFacets | null }) {
  const budgets = c.transactionType === "lease" ? RENT : SALE;
  const provinces = useMemo(() => facets?.byProvince ?? [], [facets]);
  const cities = useMemo(() => (facets?.byCity ?? []).filter((x) => !c.province || x.province === c.province), [facets, c.province]);
  return (
    <div className="text-sm">
      <div className="py-3">
        <p className="mb-1.5 text-xs font-semibold text-ink-2">The buyer wants to</p>
        <div className="flex gap-1">
          {(["sale", "lease"] as const).map((t) => (
            <button key={t} type="button" aria-pressed={c.transactionType === t} onClick={() => set({ transactionType: t, budgetMin: undefined, budgetMax: undefined })} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${c.transactionType === t ? "border-navy bg-navy text-cream" : "border-line bg-white hover:bg-sand"}`}>
              {t === "sale" ? "Buy" : "Rent"}
            </button>
          ))}
        </div>
      </div>

      <Row label="Property kind" htmlFor="m-kind" imp={{ id: "m-kind-imp", value: c.kindImportance, onChange: (v) => set({ kindImportance: v }) }}>
        <select
          id="m-kind"
          className="field"
          value=""
          onChange={(e) => e.target.value && !c.kinds.includes(e.target.value) && set({ kinds: [...c.kinds, e.target.value] })}
        >
          <option value="">{c.kinds.length ? "Add another kind…" : "Any kind (choose to narrow)"}</option>
          <optgroup label="Groups">
            {Object.entries(KIND_GROUPS).map(([k, g]) => (
              <option key={k} value={k}>
                {g.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Kinds">
            {Object.entries(KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </optgroup>
        </select>
        {c.kinds.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {c.kinds.map((k) => (
              <button key={k} type="button" onClick={() => set({ kinds: c.kinds.filter((x) => x !== k) })} className="rounded-full bg-bronze-soft px-2 py-0.5 text-[11px] hover:bg-bad-soft" aria-label={`Remove ${KIND_GROUPS[k]?.label ?? KINDS[k]?.label}`}>
                {KIND_GROUPS[k]?.label ?? KINDS[k]?.label} ×
              </button>
            ))}
          </div>
        )}
      </Row>

      <Row label="Location" htmlFor="m-region" imp={{ id: "m-loc-imp", value: c.locationImportance, onChange: (v) => set({ locationImportance: v }) }}>
        <div className="grid gap-1.5">
          <select id="m-region" className="field" value={c.region ?? ""} onChange={(e) => set({ region: (e.target.value || undefined) as BuyerCriteria["region"], province: undefined, city: undefined })}>
            <option value="">Any region</option>
            {REGIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <select aria-label="Province" className="field" value={c.province ?? ""} onChange={(e) => set({ province: e.target.value || undefined, city: undefined })}>
            <option value="">Any province</option>
            {provinces.map((p) => (
              <option key={p.value} value={p.value}>
                {p.value} ({p.count})
              </option>
            ))}
          </select>
          <select aria-label="City" className="field" value={c.city ?? ""} onChange={(e) => set({ city: e.target.value || undefined })}>
            <option value="">Any city</option>
            {cities.map((x) => (
              <option key={x.city} value={x.city}>
                {x.city} ({x.count})
              </option>
            ))}
          </select>
        </div>
      </Row>

      <Row label={c.transactionType === "lease" ? "Monthly budget" : "Budget"} htmlFor="m-max" imp={{ id: "m-budget-imp", value: c.budgetImportance, onChange: (v) => set({ budgetImportance: v }) }}>
        <div className="grid grid-cols-2 gap-1.5">
          <select aria-label="Budget from" className="field" value={c.budgetMin ?? ""} onChange={(e) => set({ budgetMin: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">No minimum</option>
            {budgets.map((b) => (
              <option key={b} value={b}>
                From {php(b)}
              </option>
            ))}
          </select>
          <select id="m-max" aria-label="Budget up to" className="field" value={c.budgetMax ?? ""} onChange={(e) => set({ budgetMax: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">No limit</option>
            {budgets.map((b) => (
              <option key={b} value={b}>
                Up to {php(b)}
              </option>
            ))}
          </select>
        </div>
      </Row>

      <Row label="Bedrooms" htmlFor="m-beds" imp={{ id: "m-beds-imp", value: c.bedroomsImportance, onChange: (v) => set({ bedroomsImportance: v }) }}>
        <select id="m-beds" className="field" value={c.minBedrooms ?? ""} onChange={(e) => set({ minBedrooms: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Any</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}+ bedrooms
            </option>
          ))}
        </select>
      </Row>

      <Row label="Size" htmlFor="m-size" imp={{ id: "m-size-imp", value: c.areaImportance, onChange: (v) => set({ areaImportance: v }) }}>
        <select id="m-size" className="field" value={c.minAreaSqm ?? ""} onChange={(e) => set({ minAreaSqm: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Any size</option>
          {SIZES.map((n) => (
            <option key={n} value={n}>
              {n.toLocaleString()}+ sqm
            </option>
          ))}
        </select>
      </Row>

      <Row label="Purpose" htmlFor="m-purpose" imp={{ id: "m-purpose-imp", value: c.purposeImportance, onChange: (v) => set({ purposeImportance: v }) }}>
        <select id="m-purpose" className="field" value={c.purpose ?? ""} onChange={(e) => set({ purpose: (e.target.value || undefined) as BuyerCriteria["purpose"] })}>
          <option value="">Not specified</option>
          {Object.entries(PURPOSES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Wanted features" htmlFor="m-feat-imp" imp={{ id: "m-feat-imp", value: c.featuresImportance, onChange: (v) => set({ featuresImportance: v }) }}>
        <div className="flex flex-wrap gap-1">
          {Object.entries(FEATURES)
            .filter(([k]) => !["unfurnished", "motivated"].includes(k))
            .map(([k, f]) => {
              const on = c.features.includes(k);
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => set({ features: on ? c.features.filter((x) => x !== k) : [...c.features, k] })} className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-navy bg-navy text-cream" : "border-line bg-white hover:border-bronze"}`}>
                  {f.label}
                </button>
              );
            })}
        </div>
      </Row>

      <div className="py-3">
        <label htmlFor="m-min" className="mb-1.5 block text-xs font-semibold text-ink-2">
          Show listings scoring at least
        </label>
        <select id="m-min" className="field" value={c.minScore} onChange={(e) => set({ minScore: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n} / 10{n === 1 ? " (show everything)" : n >= 8 ? " (strong matches only)" : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ResultCard({ r, onOpen }: { r: MatchedListing; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const l = r.listing;
  const good = r.match.parts.filter((p) => p.known && p.fit >= 0.75).slice(0, 2);
  const bad = r.match.parts.filter((p) => p.known && p.fit < 0.4).slice(0, 1);
  return (
    <article className="card p-4" data-match={l.code}>
      <div className="flex gap-3">
        <ScoreBadge score={r.match.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold">{scoreWord(r.match.score)} match</span>
            <Chip>{l.kindLabel}</Chip>
            {r.match.confidence < 0.7 && <Chip tone="warn">Some facts not stated</Chip>}
          </div>
          <p className="mt-1 font-semibold tabular-nums">{priceText(l)}</p>
          <h3 className="line-clamp-2 font-sans text-sm font-medium">{l.name}</h3>
          <p className="text-xs text-muted">
            {placeText(l)}
            {sizeText(l) ? ` · ${sizeText(l)}` : ""}
            {l.bedrooms !== null ? ` · ${l.bedrooms === 0 ? "Studio" : `${l.bedrooms} BR`}` : ""}
          </p>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs">
        {good.map((p) => (
          <li key={p.criterion} className="text-ok">
            ✓ {p.reason}
          </li>
        ))}
        {bad.map((p) => (
          <li key={p.criterion} className="text-bad">
            ✗ {p.reason}
          </li>
        ))}
      </ul>
      {open && (
        <div className="mt-3 rounded-lg bg-sand/60 p-3">
          <MatchBreakdown parts={r.match.parts} />
          <p className="mt-2 text-[10px] text-muted">
            Score {r.match.score.toFixed(1)} · data confidence {Math.round(r.match.confidence * 100)}%
          </p>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <button type="button" className="inline-flex items-center gap-1 text-xs text-ink-2 hover:underline" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <ChevronDown size={13} className={open ? "rotate-180" : ""} aria-hidden /> Why this score
        </button>
        <button type="button" className="btn btn-ghost min-h-8 px-3 text-xs" onClick={onOpen}>
          Details
        </button>
      </div>
    </article>
  );
}

function BuyerMatch({ grid }: { grid: GridSDK }) {
  const [tab, setTab] = useState<"match" | "saved">("match");
  const [c, setC] = useState<BuyerCriteria>(DEFAULT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [facets, setFacets] = useState<IndexFacets | null>(null);
  const [result, setResult] = useState<{ total: number; excluded: number; belowMinimum: number; scored: number; results: MatchedListing[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [buyers, setBuyers] = useState<BuyerSummary[]>([]);
  const [viewing, setViewing] = useState<{ id: string; label: string; description: string; total: number; results: MatchedListing[] } | null>(null);
  const seq = useRef(0);
  const closeDrawer = useCallback(() => setOpen(null), []);

  const loadBuyers = useCallback(() => grid.match.buyers().then(setBuyers).catch(() => {}), [grid]);
  useEffect(() => {
    grid.listings.facets().then(setFacets).catch(() => {});
    loadBuyers();
  }, [grid, loadBuyers]);

  const run = useCallback(
    async (criteria: BuyerCriteria, offset = 0) => {
      const my = ++seq.current;
      setBusy(true);
      setError("");
      try {
        const r = await grid.match.run(criteria, { limit: PAGE, offset });
        if (my !== seq.current) return;
        setResult((prev) => (offset && prev ? { ...r, results: [...prev.results, ...r.results] } : r));
      } catch (e) {
        if (my === seq.current) setError(errText(e));
      } finally {
        if (my === seq.current) setBusy(false);
      }
    },
    [grid],
  );

  // Re-score shortly after any change to the criteria.
  useEffect(() => {
    const t = setTimeout(() => run(c), 250);
    return () => clearTimeout(t);
  }, [c, run]);

  const set = (p: Partial<BuyerCriteria>) => setC((x) => ({ ...x, ...p }));

  const save = async () => {
    const label = await grid.ui.prompt("Name this buyer profile (no personal details: e.g. “BGC renter, 2BR, ₱60k”)", editingId ? (buyers.find((b) => b.id === editingId)?.label ?? "") : "");
    if (!label) return;
    try {
      const id = await grid.match.saveBuyer({ id: editingId ?? undefined, label, criteria: c });
      setEditingId(id);
      await loadBuyers();
      grid.ui.notify("Buyer saved. New listings that match will appear under Saved buyers.", { tone: "ok" });
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };

  const openBuyer = async (b: BuyerSummary) => {
    try {
      const r = await grid.match.buyerMatches(b.id, { limit: 50 });
      setViewing({ id: b.id, label: r.profile.label, description: r.profile.description, total: r.total, results: r.results });
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };
  const remove = async (b: BuyerSummary) => {
    if (!(await grid.ui.confirm(`Delete the buyer profile "${b.label}"?`, { danger: true, okLabel: "Delete" }))) return;
    await grid.match.deleteBuyer(b.id);
    if (editingId === b.id) setEditingId(null);
    setViewing(null);
    loadBuyers();
  };

  return (
    <div className="app-shell">
      <div role="tablist" className="flex items-center gap-1 border-b border-line bg-white px-2 pt-2">
        {(
          [
            ["match", "Match a buyer", UserPlus],
            ["saved", `Saved buyers (${buyers.length})`, Users],
          ] as const
        ).map(([k, t, Icon]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={`inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm ${tab === k ? "border-bronze font-medium" : "border-transparent text-muted"}`}>
            <Icon size={14} aria-hidden /> {t}
          </button>
        ))}
        {editingId && tab === "match" && <span className="ml-auto pb-1 text-xs text-muted">Editing: {buyers.find((b) => b.id === editingId)?.label}</span>}
      </div>

      {tab === "match" && (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside aria-label="Buyer needs" className="max-h-[45%] shrink-0 overflow-auto border-b border-line bg-white px-4 md:max-h-none md:w-80 md:border-r md:border-b-0">
            <CriteriaForm c={c} set={set} facets={facets} />
            <div className="sticky bottom-0 flex gap-2 border-t border-line bg-white py-3">
              <button type="button" className="btn btn-dark flex-1" onClick={save}>
                <Save size={14} aria-hidden /> {editingId ? "Update buyer" : "Save as buyer"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setC(DEFAULT);
                  setEditingId(null);
                }}
              >
                Reset
              </button>
            </div>
          </aside>
          <section aria-label="Matches" className="min-w-0 flex-1 overflow-auto p-4" aria-busy={busy}>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-sm" role="status">
                {result ? (
                  <>
                    <strong data-testid="match-count">{result.total.toLocaleString()}</strong> listing{result.total === 1 ? "" : "s"} score {c.minScore}+
                  </>
                ) : (
                  "Scoring…"
                )}
              </p>
              {result && (
                <p className="text-xs text-muted">
                  {result.scored.toLocaleString()} scored · {result.excluded.toLocaleString()} ruled out by must-haves · {result.belowMinimum.toLocaleString()} below {c.minScore}
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
                {error}
              </p>
            )}
            {result && result.total === 0 && (
              <div className="card p-6 text-center text-sm">
                <p className="font-medium">No listing reaches {c.minScore}/10.</p>
                <p className="mt-1 text-muted">Lower the minimum score, turn a “Must have” into “Important”, or widen the budget or location.</p>
              </div>
            )}
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
              {result?.results.map((r) => (
                <ResultCard key={r.listing.code} r={r} onOpen={() => setOpen(r.listing.code)} />
              ))}
            </div>
            {result && result.results.length < result.total && (
              <div className="mt-4 text-center">
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => run(c, result.results.length)}>
                  Show more ({(result.total - result.results.length).toLocaleString()} left)
                </button>
              </div>
            )}
            <p className="mt-4 text-[11px] text-muted">
              Score = how well each listing fits the buyer, weighted by importance (Must have ×3, Important ×2, Nice ×1). Facts a listing does not state count as half a match and lower its confidence.
            </p>
          </section>
        </div>
      )}

      {tab === "saved" && (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {viewing ? (
            <div>
              <button type="button" className="mb-3 inline-flex items-center gap-1 text-sm hover:underline" onClick={() => setViewing(null)}>
                <ArrowLeft size={14} aria-hidden /> All saved buyers
              </button>
              <h2 className="font-sans text-lg font-semibold">{viewing.label}</h2>
              <p className="text-sm text-muted">{viewing.description}</p>
              <p className="mt-2 text-sm" role="status">
                <strong>{viewing.total}</strong> matching listing{viewing.total === 1 ? "" : "s"}, kept up to date as listings change.
              </p>
              <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                {viewing.results.map((r) => (
                  <ResultCard key={r.listing.code} r={r} onOpen={() => setOpen(r.listing.code)} />
                ))}
              </div>
            </div>
          ) : buyers.length === 0 ? (
            <div className="card mx-auto max-w-md p-6 text-center text-sm">
              <p className="font-medium">No saved buyers yet.</p>
              <p className="mt-1 text-muted">Set up a buyer&apos;s needs under “Match a buyer” and press “Save as buyer”. Their matches then update by themselves whenever listings change.</p>
            </div>
          ) : (
            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
              {buyers.map((b) => (
                <li key={b.id} className="card flex flex-col p-4">
                  <div className="flex items-start gap-3">
                    {b.topScore !== null ? <ScoreBadge score={b.topScore} size="sm" /> : <span className="grid size-9 place-items-center rounded-xl bg-sand text-xs text-muted">–</span>}
                    <div className="min-w-0">
                      <p className="font-medium">{b.label}</p>
                      <p className="text-xs text-muted">{b.description}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm">
                    <strong>{b.matches}</strong> matching listing{b.matches === 1 ? "" : "s"} (score {b.criteria.minScore}+)
                  </p>
                  <div className="mt-auto flex gap-2 pt-3">
                    <button type="button" className="btn btn-dark min-h-8 flex-1 px-3 text-xs" onClick={() => openBuyer(b)}>
                      See matches
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost min-h-8 px-2 text-xs"
                      aria-label={`Edit ${b.label}`}
                      onClick={() => {
                        setC(b.criteria);
                        setEditingId(b.id);
                        setTab("match");
                      }}
                    >
                      <Pencil size={13} aria-hidden />
                    </button>
                    <button type="button" className="btn btn-ghost min-h-8 px-2 text-xs text-bad" aria-label={`Delete ${b.label}`} onClick={() => remove(b)}>
                      <Trash2 size={13} aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {open && <ListingDrawer grid={grid} code={open} onClose={closeDrawer} />}
    </div>
  );
}

export default function BuyerMatchPage() {
  return <AppFrame>{(grid) => <BuyerMatch grid={grid} />}</AppFrame>;
}
