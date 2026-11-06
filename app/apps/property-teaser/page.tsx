"use client";
/**
 * Property Teaser: design presentation decks and teaser trailers for a property, from 30 templates.
 * Projects home → template gallery → editor (components/teaser/*).
 */
import { Clapperboard, Copy, Film, Loader2, Plus, Presentation, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppFrame } from "@/components/apps/app-frame";
import { errText } from "@/components/apps/use-grid";
import { Editor, type Project } from "@/components/teaser/editor";
import { TemplateCard } from "@/components/teaser/panels";
import { SAMPLE } from "@/components/teaser/thumb";
import { ImageCache } from "@/lib/teaser/render";
import { DECK_TEMPLATES, TRAILER_TEMPLATES, brandFrom, newDoc, type Template } from "@/lib/teaser/templates";
import { emptyAgent, emptyProperty, type TeaserDoc, type TeaserKind } from "@/lib/teaser/types";
import { writeCopy } from "@/lib/teaser/copy";
import type { GridSDK, TeaserSummary } from "@/lib/sdk/types";

type View = { name: "home" } | { name: "pick"; kind: TeaserKind } | { name: "edit"; project: Project };

function Home({ grid, onNew, onOpen }: { grid: GridSDK; onNew: (k: TeaserKind) => void; onOpen: (id: string) => void }) {
  const [list, setList] = useState<TeaserSummary[] | null>(null);
  const [q, setQ] = useState("");
  const load = useCallback(() => grid.teaser.list().then(setList).catch((e) => grid.ui.notify(errText(e), { tone: "bad" })), [grid]);
  useEffect(() => {
    load();
  }, [load]);
  const shown = (list ?? []).filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="app-shell ga-desk overflow-auto">
      <div className="mx-auto w-full max-w-5xl px-5 py-8">
        <p className="eyebrow ga-rise">Property Teaser</p>
        <h1 className="ga-rise mt-2 text-3xl sm:text-4xl" style={{ animationDelay: "60ms" }}>
          Make it <span className="ga-gradient-text">irresistible</span>.
        </h1>
        <p className="ga-rise mt-2 max-w-xl text-sm text-muted" style={{ animationDelay: "120ms" }}>
          Pick one of 30 templates, add your details, photos and logo, then export to PowerPoint, PDF, Word or video. No AI needed; it writes the description from your notes.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["deck", Presentation, "New presentation", "20 deck templates · PowerPoint, PDF, Word", "from-info/15"],
              ["trailer", Clapperboard, "New teaser trailer", "10 trailer templates · MP4 video, auto-play PowerPoint", "from-[#7c3a5b]/15"],
            ] as const
          ).map(([k, Icon, label, hint, tone], i) => (
            <button key={k} type="button" data-new={k} onClick={() => onNew(k)} style={{ animationDelay: `${180 + i * 60}ms` }} className={`ga-rise spotlight group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-line bg-gradient-to-br ${tone} to-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-bronze/50 hover:shadow-lg`}>
              <span className="grid size-12 place-items-center rounded-2xl bg-white shadow-sm transition-transform group-hover:scale-110 group-hover:-rotate-3">
                <Icon size={22} />
              </span>
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
              <Plus size={18} className="ml-auto text-muted transition-transform group-hover:rotate-90" />
            </button>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-3">
          <h2 className="font-sans text-sm font-semibold">Your projects</h2>
          <div className="relative ml-auto">
            <Search size={14} className="absolute top-2.5 left-2.5 text-muted" />
            <input aria-label="Search projects" className="field h-9 w-56 pl-8 text-sm" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {list === null ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </p>
        ) : shown.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{list.length ? "No project matches." : "No projects yet. Start one above."}</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Projects">
            {shown.map((p, i) => (
              <li key={p.id} className="ga-rise group relative" style={{ animationDelay: `${i * 30}ms` }}>
                <button type="button" onClick={() => onOpen(p.id)} className="spotlight relative block w-full overflow-hidden rounded-xl border border-line bg-white text-left transition-all hover:-translate-y-0.5 hover:shadow-md" data-project={p.title}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.thumb ? <img src={p.thumb} alt="" className="aspect-video w-full bg-sand object-contain" /> : <span className="block aspect-video bg-sand" />}
                  <span className="block truncate px-2.5 pt-2 text-sm font-medium">{p.title}</span>
                  <span className="flex items-center gap-1 px-2.5 pb-2 text-[11px] text-muted">
                    {p.kind === "trailer" ? <Film size={11} /> : <Presentation size={11} />} {p.kind === "trailer" ? "Trailer" : "Presentation"} · {new Date(p.updatedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                  </span>
                </button>
                <span className="absolute top-1.5 right-1.5 hidden gap-1 group-hover:flex">
                  <button type="button" aria-label={`Duplicate ${p.title}`} className="rounded-md bg-white/95 p-1 shadow" onClick={async () => {
                    await grid.teaser.duplicate(p.id).catch((e) => grid.ui.notify(errText(e), { tone: "bad" }));
                    load();
                  }}>
                    <Copy size={13} />
                  </button>
                  <button type="button" aria-label={`Delete ${p.title}`} className="rounded-md bg-white/95 p-1 text-bad shadow" onClick={async () => {
                    if (!(await grid.ui.confirm(`Delete “${p.title}”?`, { danger: true, okLabel: "Delete" }))) return;
                    await grid.teaser.delete(p.id).catch(() => {});
                    load();
                  }}>
                    <Trash2 size={13} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Picker({ kind, base, onPick, onBack }: { kind: TeaserKind; base: Pick<TeaserDoc, "property" | "agent" | "brand">; onPick: (t: Template) => void; onBack: () => void }) {
  const images = useMemo(() => new ImageCache(), []);
  const all = kind === "deck" ? DECK_TEMPLATES : TRAILER_TEMPLATES;
  const cats = ["All", ...new Set(all.map((t) => t.category))];
  const [cat, setCat] = useState("All");
  // Previews show the user's details, or a sample property if none yet.
  const preview: TeaserDoc = useMemo(() => ({ ...newDoc(all[0]!), property: base.property.name ? base.property : { ...emptyProperty(), ...SAMPLE }, agent: base.agent, brand: base.brand }), [all, base]);
  return (
    <div className="app-shell ga-desk overflow-auto">
      <div className="mx-auto w-full max-w-6xl px-5 py-6">
        <button type="button" className="btn btn-ghost h-8 min-h-8 px-2.5 text-xs" onClick={onBack}>
          ← Back
        </button>
        <h1 className="mt-3 text-3xl">{kind === "deck" ? "Choose a presentation template" : "Choose a trailer template"}</h1>
        <p className="mt-1 text-sm text-muted">Everything stays editable: colours, fonts, text, photos and layout. You can switch templates later without losing your details.</p>
        <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Categories">
          {cats.map((c) => (
            <button key={c} role="tab" aria-selected={cat === c} type="button" onClick={() => setCat(c)} className={`rounded-full px-3 py-1 text-xs transition-colors ${cat === c ? "bg-navy text-cream" : "bg-white ring-1 ring-line hover:ring-bronze"}`}>
              {c}
            </button>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {all
            .filter((t) => cat === "All" || t.category === cat)
            .map((t, i) => (
              <div key={t.id} className="ga-rise" style={{ animationDelay: `${i * 35}ms` }}>
                <TemplateCard t={t} doc={{ ...preview, brand: { ...brandFrom(t, base.brand.logo) } }} images={images} onPick={onPick} width={t.vertical ? 140 : 250} />
                <p className="mt-1 px-1 text-[11px] text-muted">{t.description}</p>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function TeaserApp({ grid }: { grid: GridSDK }) {
  // Opened with a kind but no listing: go straight to the template gallery.
  const [view, setView] = useState<View>(() => (!grid.launchArgs.code && (grid.launchArgs.kind === "deck" || grid.launchArgs.kind === "trailer") ? { name: "pick", kind: grid.launchArgs.kind } : { name: "home" }));
  const [defaults, setDefaults] = useState<{ agent: TeaserDoc["agent"]; logo: string | null }>({ agent: emptyAgent(), logo: null });
  const [prefill, setPrefill] = useState<TeaserDoc["property"] | null>(null);

  useEffect(() => {
    grid.kv
      .get<{ agent: TeaserDoc["agent"]; logo: string | null }>("teaser-defaults")
      .then((d) => d && setDefaults({ agent: { ...emptyAgent(), ...d.agent }, logo: d.logo ?? null }))
      .catch(() => {});
    // Opened from a listing: grid.ui.openApp("property-teaser", { code, kind })
    const code = typeof grid.launchArgs.code === "string" ? grid.launchArgs.code : null;
    if (code)
      grid.listings
        .get(code)
        .then((l) => {
          if (!l) return;
          const c = writeCopy(`${l.name}\n${l.notes ?? ""}`, {}, 0);
          setPrefill({
            ...emptyProperty(),
            name: l.name,
            listingCode: l.code,
            transaction: l.transactionType === "lease" ? "lease" : "sale",
            kind: l.kindLabel,
            price: l.price,
            location: l.location,
            city: l.city ?? "",
            bedrooms: l.bedrooms,
            bathrooms: l.bathrooms ?? null,
            floorArea: l.floorAreaSqm,
            lotArea: l.lotAreaSqm,
            description: c.short,
            tagline: c.taglines[0] ?? "",
            highlights: c.highlights,
            amenities: c.amenities,
          });
          setView({ name: "pick", kind: grid.launchArgs.kind === "trailer" ? "trailer" : "deck" });
        })
        .catch(() => {});
  }, [grid]);

  const base = useMemo(() => ({ property: prefill ?? emptyProperty(), agent: defaults.agent, brand: { ...brandFrom(DECK_TEMPLATES[0]!), logo: defaults.logo } }), [prefill, defaults]);

  const open = async (id: string) => {
    try {
      const p = await grid.teaser.get(id);
      setView({ name: "edit", project: { id: p.id, title: p.title, doc: p.data as unknown as TeaserDoc } });
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };

  return (
    <>
      {/* Design fonts (self-hosted): React hoists this stylesheet into the head. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/teaser-fonts/fonts.css" precedence="default" />
      {view.name === "home" && <Home grid={grid} onNew={(k) => setView({ name: "pick", kind: k })} onOpen={open} />}
      {view.name === "pick" && (
        <Picker
          kind={view.kind}
          base={base}
          onBack={() => setView({ name: "home" })}
          onPick={(t) => {
            const doc = newDoc(t, { property: base.property, agent: base.agent, brand: brandFrom(t, defaults.logo) });
            setView({ name: "edit", project: { title: base.property.name || (t.kind === "trailer" ? "New teaser trailer" : "New presentation"), doc } });
            setPrefill(null);
          }}
        />
      )}
      {view.name === "edit" && <Editor key={view.project.id ?? "new"} grid={grid} project={view.project} onBack={() => setView({ name: "home" })} />}
    </>
  );
}

export default function PropertyTeaserPage() {
  return <AppFrame>{(grid) => <TeaserApp grid={grid} />}</AppFrame>;
}
