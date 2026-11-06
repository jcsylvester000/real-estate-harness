"use client";
import { FileUp, History, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppFrame } from "@/components/apps/app-frame";
import { Chip, ListingDrawer, placeText, priceText } from "@/components/apps/listing-ui";
import { errText } from "@/components/apps/use-grid";
import type { GridSDK, ImportBatch, ImportSummary, IndexFacets, ListingCard, ListingDetail, SearchInput, SearchResult } from "@/lib/sdk/types";

const PAGE = 50;
const TYPES = ["residential", "commercial", "land", "industrial", "agricultural", "other"];
const KINDS: [string, string][] = [
  ["", "Not stated"],
  ["condominium-unit", "Condominium unit"],
  ["house-and-lot", "House and lot"],
  ["townhouse", "Townhouse"],
  ["apartment", "Apartment"],
  ["residential-lot", "Residential lot"],
  ["subdivision-lot", "Subdivision lot"],
  ["commercial-lot", "Commercial lot"],
  ["industrial-lot", "Industrial lot"],
  ["office-space", "Office space"],
  ["retail-space", "Retail space"],
  ["whole-commercial-building", "Commercial building"],
  ["mixed-use-building", "Mixed-use building"],
  ["warehouse", "Warehouse"],
  ["industrial-compound", "Industrial compound"],
  ["hotel-resort", "Hotel or resort"],
  ["farm-lot", "Farm or agricultural lot"],
];
const nice = (s: string) => s.replace(/[_-]/g, " ").replace(/^./, (c) => c.toUpperCase());

interface Draft {
  code?: string;
  name: string;
  transactionType: "sale" | "lease";
  propertyType: string;
  propertySubType: string;
  price: number | null;
  location: string;
  availability: string;
  bedrooms: number | null;
  bathrooms: number | null;
  floorAreaSqm: number | null;
  lotAreaSqm: number | null;
  titleType: string;
  foreignEligible: boolean | null;
  notes: string;
}
const EMPTY: Draft = { name: "", transactionType: "sale", propertyType: "residential", propertySubType: "", price: null, location: "", availability: "available", bedrooms: null, bathrooms: null, floorAreaSqm: null, lotAreaSqm: null, titleType: "", foreignEligible: null, notes: "" };
const fromDetail = (l: ListingDetail): Draft => ({
  code: l.code,
  name: l.name,
  transactionType: l.transactionType as Draft["transactionType"],
  propertyType: l.propertyType,
  propertySubType: l.propertySubType,
  price: l.price,
  location: l.location,
  availability: l.availability,
  bedrooms: l.bedrooms,
  bathrooms: l.bathrooms,
  floorAreaSqm: l.floorAreaSqm,
  lotAreaSqm: l.lotAreaSqm,
  titleType: l.titleType,
  foreignEligible: l.foreignEligible,
  notes: l.notes,
});

function Editor({ draft, onCancel, onSave }: { draft: Draft; onCancel: () => void; onSave: (d: Draft) => Promise<void> }) {
  const [d, setD] = useState<Draft>(draft);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v === "" ? null : Number(v));
  const numField = (k: "price" | "bedrooms" | "bathrooms" | "floorAreaSqm" | "lotAreaSqm", label: string, req = false) => (
    <div>
      <label htmlFor={`l-${k}`} className="label">
        {label} {req && <span className="text-bad">*</span>}
      </label>
      <input id={`l-${k}`} className="field" type="number" step="any" min={0} required={req} value={d[k] ?? ""} onChange={(e) => set(k, num(e.target.value))} />
    </div>
  );
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-navy/40 p-3">
      <form
        className="card max-h-full w-full max-w-2xl overflow-auto p-5"
        aria-label={d.code ? `Edit ${d.code}` : "New listing"}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(d);
          } catch (err) {
            setError(errText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-sans text-base font-semibold">{d.code ? `Edit ${d.code}` : "New listing"}</h2>
          <button type="button" aria-label="Close" onClick={onCancel} className="grid size-8 place-items-center rounded hover:bg-sand">
            <X size={16} />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="l-name" className="label">
              Listing title <span className="text-bad">*</span>
            </label>
            <input id="l-name" className="field" required minLength={3} maxLength={300} value={d.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="l-location" className="label">
              Location (building or street, city) <span className="text-bad">*</span>
            </label>
            <input id="l-location" className="field" required minLength={2} maxLength={300} value={d.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Salcedo Village, Makati City" />
          </div>
          <div>
            <label htmlFor="l-tx" className="label">
              For
            </label>
            <select id="l-tx" className="field" value={d.transactionType} onChange={(e) => set("transactionType", e.target.value as Draft["transactionType"])}>
              <option value="sale">Sale</option>
              <option value="lease">Lease (monthly rent)</option>
            </select>
          </div>
          {numField("price", d.transactionType === "lease" ? "Monthly rent (₱)" : "Price (₱)", true)}
          <div>
            <label htmlFor="l-type" className="label">
              Property type
            </label>
            <select id="l-type" className="field" value={d.propertyType} onChange={(e) => set("propertyType", e.target.value)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {nice(t)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="l-kind" className="label">
              Kind
            </label>
            <select id="l-kind" className="field" value={d.propertySubType} onChange={(e) => set("propertySubType", e.target.value)}>
              {KINDS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {numField("bedrooms", "Bedrooms (0 = studio)")}
          {numField("bathrooms", "Bathrooms")}
          {numField("floorAreaSqm", "Floor area (sqm)")}
          {numField("lotAreaSqm", "Lot area (sqm)")}
          <div>
            <label htmlFor="l-avail" className="label">
              Availability
            </label>
            <select id="l-avail" className="field" value={d.availability} onChange={(e) => set("availability", e.target.value)}>
              {["available", "reserved", "sold", "inactive"].map((a) => (
                <option key={a} value={a}>
                  {nice(a)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="l-title" className="label">
              Title type (TCT, CCT…)
            </label>
            <input id="l-title" className="field" maxLength={40} value={d.titleType} onChange={(e) => set("titleType", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="l-foreign" className="label">
              Foreign buyer
            </label>
            <select id="l-foreign" className="field" value={d.foreignEligible === null ? "" : String(d.foreignEligible)} onChange={(e) => set("foreignEligible", e.target.value === "" ? null : e.target.value === "true")}>
              <option value="">Not stated</option>
              <option value="true">Eligible (condo within the 40% quota)</option>
              <option value="false">Not eligible</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="l-notes" className="label">
              Notes (searchable)
            </label>
            <textarea id="l-notes" className="field" rows={3} maxLength={4000} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
        <p className="mt-3 text-[11px] text-muted">City, province, kind and search words are worked out automatically. Listings from a GRID export are overwritten when that export is imported again.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-dark" disabled={busy}>
            {busy ? "Saving…" : "Save listing"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ImportPanel({ grid, onDone, onClose }: { grid: GridSDK; onDone: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<ImportBatch[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const load = useCallback(() => grid.listings.imports().then(setHistory).catch(() => {}), [grid]);
  useEffect(() => {
    load();
  }, [load]);
  const run = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5.5 * 1024 * 1024) return setError("The file is larger than 5.5 MB. Split it, or use npm run listings:import on the server.");
    setBusy(true);
    setError("");
    setSummary(null);
    try {
      const s = await grid.listings.import(f.name, await f.text());
      setSummary(s);
      onDone();
      load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-navy/40 p-3">
      <section className="card max-h-full w-full max-w-xl overflow-auto p-5" aria-label="Import listings">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-sans text-base font-semibold">Import a GRID listings export</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-8 place-items-center rounded hover:bg-sand">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-muted">
          Choose the CSV from GRID&apos;s &ldquo;listings-published&rdquo; report. New codes are added, existing codes are updated, and rows with problems are skipped and listed. The search index updates straight away.
        </p>
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-2 bg-sand/50 p-6 text-sm hover:border-bronze">
          <FileUp size={18} aria-hidden /> {busy ? "Importing…" : "Choose a CSV file"}
          <input ref={file} type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={(e) => run(e.target.files?.[0])} />
        </label>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
        {summary && (
          <div role="status" className="mt-3 rounded-lg bg-ok-soft p-3 text-sm text-ok">
            <p className="font-medium">
              {summary.fileName}: {summary.rowsTotal.toLocaleString()} rows read
            </p>
            <p>
              {summary.inserted.toLocaleString()} new · {summary.updated.toLocaleString()} updated · {summary.skipped.toLocaleString()} skipped
            </p>
            {summary.problems.length > 0 && (
              <ul className="mt-2 max-h-32 list-disc overflow-auto pl-5 text-xs text-ink-2">
                {summary.problems.map((p) => (
                  <li key={`${p.row}-${p.code}`}>
                    Row {p.row} {p.code}: {p.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <h3 className="mt-5 mb-2 flex items-center gap-1.5 font-sans text-xs font-semibold tracking-wider text-muted uppercase">
          <History size={13} aria-hidden /> Recent imports
        </h3>
        {history.length === 0 ? (
          <p className="text-xs text-muted">None yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white text-xs">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between gap-2 px-3 py-2">
                <span className="truncate">{h.fileName}</span>
                <span className="shrink-0 text-muted">
                  {h.inserted} new · {h.updated} upd · {h.skipped} skip · {new Date(h.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Listings({ grid }: { grid: GridSDK }) {
  const canEdit = grid.user?.role === "admin" || grid.user?.role === "broker";
  const [q, setQ] = useState("");
  const [f, setF] = useState<SearchInput>({});
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [facets, setFacets] = useState<IndexFacets | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const closeView = useCallback(() => setViewing(null), []);

  const loadFacets = useCallback(() => grid.listings.facets().then(setFacets).catch(() => {}), [grid]);
  const load = useCallback(async () => {
    try {
      const r = await grid.listings.search({
        ...f,
        query: q || undefined,
        availability: showInactive ? ["available", "reserved", "sold", "inactive"] : ["available"],
        sort: q ? "relevance" : "newest",
        limit: PAGE,
        offset: page * PAGE,
      });
      setError("");
      setResult(r);
    } catch (e) {
      setError(errText(e));
    }
  }, [grid, f, q, showInactive, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    loadFacets();
  }, [loadFacets]);

  const refresh = () => {
    load();
    loadFacets();
  };
  const filter = (patch: Partial<SearchInput>) => {
    setPage(0);
    setF((x) => {
      const n = { ...x, ...patch };
      for (const k of Object.keys(n) as (keyof SearchInput)[]) if (n[k] === undefined || n[k] === "") delete n[k];
      return n;
    });
  };
  const save = async (d: Draft) => {
    await grid.listings.save({ ...d, price: d.price ?? 0, code: d.code });
    setEditing(null);
    grid.ui.notify("Listing saved and indexed.", { tone: "ok" });
    refresh();
  };
  const edit = async (code: string) => {
    try {
      const l = await grid.listings.get(code);
      if (l) setEditing(fromDetail(l));
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };
  const remove = async (l: ListingCard) => {
    if (!(await grid.ui.confirm(`Delete ${l.code} "${l.name}"? The AI and Property Finder will stop showing it.`, { danger: true, okLabel: "Delete" }))) return;
    try {
      await grid.listings.delete(l.code);
      refresh();
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };

  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE)) : 1;
  return (
    <div className="app-shell">
      <div className="flex flex-wrap items-end gap-2 border-b border-line bg-white p-3">
        <div className="min-w-52 flex-1">
          <label htmlFor="q" className="label">
            Search the index
          </label>
          <div className="relative">
            <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              id="q"
              className="field pl-8"
              placeholder="Name, building, place or code"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </div>
        </div>
        <div>
          <label htmlFor="tx" className="label">
            For
          </label>
          <select id="tx" className="field" value={f.transactionType ?? ""} onChange={(e) => filter({ transactionType: (e.target.value || undefined) as SearchInput["transactionType"] })}>
            <option value="">Sale or lease</option>
            <option value="sale">Sale</option>
            <option value="lease">Lease</option>
          </select>
        </div>
        <div>
          <label htmlFor="kind" className="label">
            Kind
          </label>
          <select id="kind" className="field max-w-48" value={f.kind ?? ""} onChange={(e) => filter({ kind: e.target.value || undefined })}>
            <option value="">All kinds</option>
            {facets?.byKind.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label} ({k.count})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="city" className="label">
            City
          </label>
          <select id="city" className="field max-w-44" value={f.city ?? ""} onChange={(e) => filter({ city: e.target.value || undefined })}>
            <option value="">All cities</option>
            {facets?.byCity.map((c) => (
              <option key={c.city} value={c.city}>
                {c.city} ({c.count})
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-xs">
          <input
            type="checkbox"
            className="size-4 accent-navy"
            checked={showInactive}
            onChange={(e) => {
              setShowInactive(e.target.checked);
              setPage(0);
            }}
          />
          Include inactive, reserved, sold
        </label>
        {canEdit && (
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setImporting(true)}>
              <FileUp size={15} aria-hidden /> Import CSV
            </button>
            <button type="button" className="btn btn-dark" onClick={() => setEditing({ ...EMPTY })}>
              <Plus size={15} aria-hidden /> Add listing
            </button>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error && (
          <p role="alert" className="m-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
        {result && result.total === 0 && (
          <div className="p-8 text-center text-sm text-muted">
            {facets && facets.totalAvailable === 0 ? (canEdit ? "The listings database is empty. Import a GRID CSV export to start." : "No listings yet. Ask a broker or admin to import GRID's listings.") : "No listings match these filters."}
          </div>
        )}
        {result && result.total > 0 && (
          <table className="w-full text-left text-[13px]">
            <caption className="sr-only">Listings</caption>
            <thead className="sticky top-0 z-10 bg-sand">
              <tr>
                {["Code", "Listing", "Where", "Kind", "Price", "Status", ""].map((h) => (
                  <th key={h} scope="col" className="border-b border-line px-3 py-2 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.listings.map((l) => (
                <tr key={l.code} className="hover:bg-white">
                  <td className="border-b border-line px-3 py-2 font-mono text-[11px] whitespace-nowrap">{l.code}</td>
                  <td className="max-w-md border-b border-line px-3 py-2">
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => setViewing(l.code)}>
                      {l.name}
                    </button>
                    {l.source === "demo" && (
                      <span className="ml-1">
                        <Chip tone="warn">demo</Chip>
                      </span>
                    )}
                    <span className="block truncate text-xs text-muted">{l.location}</span>
                  </td>
                  <td className="border-b border-line px-3 py-2 text-xs">{placeText(l)}</td>
                  <td className="border-b border-line px-3 py-2 text-xs">
                    {l.kindLabel}
                    {l.kindInferred && <span title="Guessed from the name">*</span>}
                  </td>
                  <td className="border-b border-line px-3 py-2 tabular-nums whitespace-nowrap">{priceText(l)}</td>
                  <td className="border-b border-line px-3 py-2 text-xs">{nice(l.availability)}</td>
                  <td className="border-b border-line px-2 py-2 whitespace-nowrap">
                    {canEdit && (
                      <>
                        <button type="button" aria-label={`Edit ${l.code}`} onClick={() => edit(l.code)} className="inline-grid size-8 place-items-center rounded hover:bg-sand">
                          <Pencil size={14} />
                        </button>
                        <button type="button" aria-label={`Delete ${l.code}`} onClick={() => remove(l)} className="inline-grid size-8 place-items-center rounded text-muted hover:bg-bad-soft hover:text-bad">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-white px-3 py-1.5 text-[11px] text-muted">
        <span role="status">
          {result ? `${result.total.toLocaleString()} listing${result.total === 1 ? "" : "s"}` : "Loading…"}
          {facets ? ` · ${facets.totalAvailable.toLocaleString()} available in the index` : ""}
        </span>
        {result && pages > 1 && (
          <span className="ml-auto flex items-center gap-1">
            <button type="button" className="rounded px-2 py-1 hover:bg-sand disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            Page {page + 1} of {pages}
            <button type="button" className="rounded px-2 py-1 hover:bg-sand disabled:opacity-40" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </span>
        )}
      </div>
      {editing && <Editor draft={editing} onCancel={() => setEditing(null)} onSave={save} />}
      {importing && <ImportPanel grid={grid} onDone={refresh} onClose={() => setImporting(false)} />}
      {viewing && <ListingDrawer grid={grid} code={viewing} onClose={closeView} extraActions={canEdit ? (l) => <button type="button" className="btn btn-ghost justify-start" onClick={() => { setViewing(null); edit(l.code); }}><Pencil size={15} aria-hidden /> Edit this listing</button> : undefined} />}
    </div>
  );
}

export default function ListingsPage() {
  return <AppFrame>{(grid) => <Listings grid={grid} />}</AppFrame>;
}
