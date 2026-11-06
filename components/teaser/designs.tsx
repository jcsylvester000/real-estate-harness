"use client";
/**
 * Saved designs on the Property Teaser home: reuse one look for many listings.
 * "Use for listings" makes one project per chosen listing; the design stays, the property details switch.
 */
import { Check, Loader2, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { errText } from "@/components/apps/use-grid";
import { renderToCanvas, ImageCache } from "@/lib/teaser/render";
import { fromDesign, propertyFromListing } from "@/lib/teaser/listing";
import type { TeaserDoc } from "@/lib/teaser/types";
import type { GridSDK, ListingCard, SavedDesign } from "@/lib/sdk/types";

export const MAX_BATCH = 20;

export function MyDesigns({ grid, onChanged }: { grid: GridSDK; onChanged: () => void }) {
  const [list, setList] = useState<SavedDesign[]>([]);
  const [apply, setApply] = useState<SavedDesign | null>(null);
  const load = () => grid.teaser.templates().then(setList).catch(() => {});
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list.length) return null;
  return (
    <section className="mt-8" aria-label="My designs">
      <h2 className="font-sans text-sm font-semibold">My designs</h2>
      <p className="text-xs text-muted">Same look, different property. Apply a design to one or more listings and each gets its own project.</p>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((d) => (
          <li key={d.id} className="group relative overflow-hidden rounded-xl border border-line bg-white" data-design={d.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {d.thumb ? <img src={d.thumb} alt="" className="aspect-video w-full bg-sand object-contain" /> : <span className="block aspect-video bg-sand" />}
            <span className="block truncate px-2.5 pt-2 text-sm font-medium">{d.name}</span>
            <span className="block px-2.5 text-[11px] text-muted">{d.kind === "trailer" ? "Trailer design" : "Presentation design"}</span>
            <div className="p-2">
              <button type="button" className="btn btn-dark h-8 min-h-8 w-full text-xs" onClick={() => setApply(d)}>
                Use for listings…
              </button>
            </div>
            <button
              type="button"
              aria-label={`Delete design ${d.name}`}
              className="absolute top-1.5 right-1.5 hidden rounded-md bg-white/95 p-1 text-bad shadow group-hover:block"
              onClick={async () => {
                if (!(await grid.ui.confirm(`Delete the design “${d.name}”? Projects made from it stay.`, { danger: true, okLabel: "Delete" }))) return;
                await grid.teaser.deleteTemplate(d.id).catch(() => {});
                load();
              }}
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
      {apply && (
        <ApplyDialog
          grid={grid}
          design={apply}
          onClose={() => setApply(null)}
          onDone={() => {
            setApply(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

/** Pick listings, then create one project per listing from the design. */
export function ApplyDialog({ grid, design, onClose, onDone, preselect }: { grid: GridSDK; design: SavedDesign; onClose: () => void; onDone: (ids: string[]) => void; preselect?: string[] }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ListingCard[]>([]);
  const [chosen, setChosen] = useState<Map<string, ListingCard>>(new Map());
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      grid.listings
        .search({ query: q.trim() || undefined, limit: 30, sort: q.trim() ? "relevance" : "newest" })
        .then((r) => {
          setHits(r.listings);
          if (preselect?.length) setChosen((m) => (m.size ? m : new Map(r.listings.filter((l) => preselect.includes(l.code)).map((l) => [l.code, l]))));
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [grid, q, preselect]);

  const toggle = (l: ListingCard) =>
    setChosen((m) => {
      const n = new Map(m);
      if (n.has(l.code)) n.delete(l.code);
      else if (n.size < MAX_BATCH) n.set(l.code, l);
      return n;
    });

  const run = async () => {
    const items = [...chosen.values()];
    setBusy({ done: 0, total: items.length });
    const images = new ImageCache();
    const ids: string[] = [];
    try {
      const r = await grid.teaser.getTemplate(design.id);
      const base = r.data as unknown as TeaserDoc;
      for (const [i, card] of items.entries()) {
        const l = (await grid.listings.get(card.code)) ?? card;
        const doc = fromDesign(base, propertyFromListing(l));
        let thumb = "";
        try {
          thumb = renderToCanvas(doc, doc.slides[0]!, images, 360 / doc.width).toDataURL("image/jpeg", 0.72);
        } catch {
          /* thumbnail is optional */
        }
        const s = await grid.teaser.save({ kind: doc.kind, title: `${l.name} · ${design.name}`.slice(0, 120), templateId: doc.templateId, data: doc as unknown as Record<string, unknown>, thumb });
        ids.push(s.id);
        setBusy({ done: i + 1, total: items.length });
      }
      grid.ui.notify(`Made ${ids.length} project${ids.length === 1 ? "" : "s"} from “${design.name}”. Add photos to each before exporting.`, { tone: "ok" });
      onDone(ids);
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
      setBusy(null);
      if (ids.length) onDone(ids);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4" role="dialog" aria-modal="true" aria-label={`Use ${design.name} for listings`}>
      <div className="ga-pop flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">Use “{design.name}” for listings</p>
            <p className="text-xs text-muted">Pick up to {MAX_BATCH}. Each gets its own project with this design.</p>
          </div>
          <button type="button" aria-label="Close" className="ga-icon-btn ml-auto" onClick={onClose} disabled={!!busy}>
            <X size={16} />
          </button>
        </header>
        <div className="relative px-4 pt-3">
          <Search size={14} className="absolute top-5.5 left-6.5 text-muted" aria-hidden />
          <input aria-label="Search listings" className="field h-9 w-full pl-8 text-sm" placeholder="Search by name, place or code" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <ul className="min-h-40 flex-1 space-y-1 overflow-y-auto p-4" aria-label="Listings">
          {hits.map((l) => {
            const on = chosen.has(l.code);
            return (
              <li key={l.code}>
                <button type="button" aria-pressed={on} data-listing={l.code} onClick={() => toggle(l)} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${on ? "border-bronze bg-bronze-soft" : "border-line hover:border-bronze"}`}>
                  <span className={`grid size-4 shrink-0 place-items-center rounded border ${on ? "border-bronze bg-bronze text-white" : "border-line"}`}>{on && <Check size={11} />}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{l.name}</span>
                    <span className="block truncate text-muted">
                      {l.code} · {l.location}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {!hits.length && <li className="text-xs text-muted">No listings found.</li>}
        </ul>
        <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
          <span className="text-xs text-muted" role="status">
            {busy ? `Making ${busy.done} of ${busy.total}…` : `${chosen.size} selected`}
          </span>
          <button type="button" className="btn btn-dark ml-auto h-9 min-h-9 px-4 text-sm" disabled={!chosen.size || !!busy} onClick={run}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Make {chosen.size || ""} project{chosen.size === 1 ? "" : "s"}
          </button>
        </footer>
      </div>
    </div>
  );
}
