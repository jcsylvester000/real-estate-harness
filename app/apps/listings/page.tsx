"use client";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/apps/app-frame";
import { php } from "@/components/apps/result-view";
import { errText } from "@/components/apps/use-grid";
import type { GridSDK, ListingRow } from "@/lib/sdk/types";

const TYPES = ["condominium", "house_and_lot", "lot", "commercial"];
const STATUSES = ["available", "pre_selling", "for_lease", "reserved", "sold"];
const nice = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

type Draft = Partial<ListingRow> & { price?: number };
const EMPTY: Draft = { title: "", city: "", area: "", propertyType: "condominium", bedrooms: 0, bathrooms: 1, floorAreaSqm: null, lotAreaSqm: null, status: "available", titleType: "", foreignEligible: false, notes: "" };

function Editor({ draft, onCancel, onSave }: { draft: Draft; onCancel: () => void; onSave: (d: Draft) => Promise<void> }) {
  const [d, setD] = useState<Draft>(draft);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Draft, v: unknown) => setD((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v === "" ? null : Number(v));
  const field = (k: keyof Draft, lbl: string, type = "text", req = false) => (
    <div>
      <label htmlFor={`l-${k}`} className="label">
        {lbl} {req && <span className="text-bad">*</span>}
      </label>
      <input
        id={`l-${k}`}
        className="field"
        type={type}
        step="any"
        required={req}
        value={d[k] === null || d[k] === undefined ? "" : String(d[k])}
        onChange={(e) => set(k, type === "number" ? num(e.target.value) : e.target.value)}
      />
    </div>
  );
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-navy/40 p-3">
      <form
        className="card max-h-full w-full max-w-2xl overflow-auto p-5"
        aria-label={d.id ? `Edit ${d.id}` : "New listing"}
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
          <h2 className="font-sans text-base font-semibold">{d.id ? `Edit ${d.id}` : "New listing"}</h2>
          <button type="button" aria-label="Close" onClick={onCancel} className="inline-grid size-8 place-items-center rounded hover:bg-sand">
            <X size={16} />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("title", "Title", "text", true)}</div>
          {field("city", "City", "text", true)}
          {field("area", "Area / barangay")}
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
            <label htmlFor="l-status" className="label">
              Status
            </label>
            <select id="l-status" className="field" value={d.status} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.map((t) => (
                <option key={t} value={t}>
                  {nice(t)}
                </option>
              ))}
            </select>
          </div>
          {field("price", "Price (₱, or monthly rent if for lease)", "number", true)}
          {field("titleType", "Title type (TCT, CCT…)")}
          {field("bedrooms", "Bedrooms", "number")}
          {field("bathrooms", "Bathrooms", "number")}
          {field("floorAreaSqm", "Floor area (sqm)", "number")}
          {field("lotAreaSqm", "Lot area (sqm)", "number")}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={!!d.foreignEligible} onChange={(e) => set("foreignEligible", e.target.checked)} className="size-4 accent-navy" />
            A foreign buyer may purchase this unit (condo within the 40% quota)
          </label>
          <div className="sm:col-span-2">
            <label htmlFor="l-notes" className="label">
              Notes
            </label>
            <textarea id="l-notes" className="field" rows={3} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
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

function Listings({ grid }: { grid: GridSDK }) {
  const canEdit = grid.user?.role === "admin" || grid.user?.role === "broker";
  const [rows, setRows] = useState<ListingRow[] | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      setRows(
        await grid.listings.search({
          q: q || undefined,
          propertyType: type || undefined,
          status: status ? [status] : undefined,
          maxPrice: maxPrice ? Number(maxPrice) : undefined,
          limit: 200,
        }),
      );
    } catch (e) {
      setError(errText(e));
    }
  }, [grid, q, type, status, maxPrice]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const save = async (d: Draft) => {
    const { isDemo: _demo, updatedAt: _u, ...rest } = d;
    void _demo;
    void _u;
    await grid.listings.save(rest);
    setEditing(null);
    grid.ui.notify("Listing saved.", { tone: "ok" });
    load();
  };
  const remove = async (l: ListingRow) => {
    if (!(await grid.ui.confirm(`Delete ${l.id} "${l.title}"? The AI will stop recommending it.`, { danger: true, okLabel: "Delete" }))) return;
    try {
      await grid.listings.delete(l.id);
      load();
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };

  return (
    <div className="app-shell">
      <div className="flex flex-wrap items-end gap-2 border-b border-line bg-white p-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="label">
            Search
          </label>
          <div className="relative">
            <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" aria-hidden />
            <input id="q" className="field pl-8" placeholder="Title, city, area or ID" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="type" className="label">
            Type
          </label>
          <select id="type" className="field" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {nice(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="label">
            Status
          </label>
          <select id="status" className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((t) => (
              <option key={t} value={t}>
                {nice(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="w-36">
          <label htmlFor="max" className="label">
            Max price (₱)
          </label>
          <input id="max" className="field" type="number" min={0} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
        </div>
        {canEdit && (
          <button type="button" className="btn btn-dark" onClick={() => setEditing({ ...EMPTY })}>
            <Plus size={15} aria-hidden /> Add listing
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error && (
          <p role="alert" className="m-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
        {rows && rows.length === 0 && (
          <div className="p-8 text-center text-sm text-muted">
            No listings match.{" "}
            {canEdit ? "Add one, or ask an admin to load the demo inventory (npm run db:seed)." : "Ask a broker to add inventory."}
          </div>
        )}
        {rows && rows.length > 0 && (
          <table className="w-full text-left text-[13px]">
            <caption className="sr-only">Listings</caption>
            <thead className="sticky top-0 bg-sand">
              <tr>
                {["ID", "Listing", "Location", "Type", "Beds", "Price", "Status", ""].map((h) => (
                  <th key={h} scope="col" className="border-b border-line px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="hover:bg-white">
                  <td className="border-b border-line px-3 py-2 font-mono text-xs">
                    {l.id}
                    {l.isDemo && <span className="ml-1 rounded bg-warn-soft px-1 text-[10px] text-warn">demo</span>}
                  </td>
                  <td className="border-b border-line px-3 py-2">
                    <span className="font-medium">{l.title}</span>
                    {l.foreignEligible && <span className="ml-1 rounded bg-info-soft px-1 text-[10px] text-info">foreign OK</span>}
                    {l.notes && <span className="block max-w-sm truncate text-xs text-muted">{l.notes}</span>}
                  </td>
                  <td className="border-b border-line px-3 py-2">
                    {l.city}
                    {l.area && <span className="text-muted">, {l.area}</span>}
                  </td>
                  <td className="border-b border-line px-3 py-2">{nice(l.propertyType)}</td>
                  <td className="border-b border-line px-3 py-2 tabular-nums">{l.bedrooms || "Studio"}</td>
                  <td className="border-b border-line px-3 py-2 tabular-nums">
                    {php(l.price)}
                    {l.status === "for_lease" && <span className="text-muted">/mo</span>}
                  </td>
                  <td className="border-b border-line px-3 py-2">{nice(l.status)}</td>
                  <td className="border-b border-line px-2 py-2 whitespace-nowrap">
                    {canEdit && (
                      <>
                        <button type="button" aria-label={`Edit ${l.id}`} onClick={() => setEditing({ ...l })} className="inline-grid size-8 place-items-center rounded hover:bg-sand">
                          <Pencil size={14} />
                        </button>
                        <button type="button" aria-label={`Delete ${l.id}`} onClick={() => remove(l)} className="inline-grid size-8 place-items-center rounded text-muted hover:bg-bad-soft hover:text-bad">
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
      <p className="border-t border-line bg-white px-3 py-1.5 text-[11px] text-muted">
        {rows ? `${rows.length} shown. ` : ""}The AI may recommend only listings in this inventory with status Available, Pre-selling or For lease.
      </p>
      {editing && <Editor draft={editing} onCancel={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

export default function ListingsPage() {
  return <AppFrame>{(grid) => <Listings grid={grid} />}</AppFrame>;
}
