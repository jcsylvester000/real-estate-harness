"use client";
/** Left-hand panels of the Property Teaser editor: Templates, Details, Brand, Elements and Photos. */
import { ArrowDown, ArrowUp, Check, ChevronDown, ImagePlus, Link2, Loader2, Plus, RefreshCw, Search, Sparkles, Trash2, Upload, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { errText } from "@/components/apps/use-grid";
import { AMENITIES, amenityInfo } from "@/lib/teaser/amenities";
import { writeCopy, type CopyResult } from "@/lib/teaser/copy";
import { iconDataUrl, ICON_NAMES } from "@/lib/teaser/icons";
import type { ImageCache } from "@/lib/teaser/render";
import { DECK_TEMPLATES, TRAILER_TEMPLATES, newDoc, type Template } from "@/lib/teaser/templates";
import { uid, type El, type ShapeKind, type TeaserDoc } from "@/lib/teaser/types";
import { KINDS } from "@/lib/listings/kinds";
import type { GridSDK, TeaserAsset, WebImage } from "@/lib/sdk/types";
import { prepareImage } from "./images";
import { SlideThumb } from "./thumb";

export const FONTS = ["Poppins", "Montserrat", "Inter", "Raleway", "Oswald", "Bebas Neue", "Playfair Display", "DM Serif Display", "Cormorant Garamond", "Lora", "Libre Baskerville", "Great Vibes"];
export const FONT_PAIRS: [string, string, string][] = [
  ["Playfair Display", "Poppins", "Classic luxury"],
  ["Montserrat", "Inter", "Clean modern"],
  ["Bebas Neue", "Inter", "Bold and loud"],
  ["DM Serif Display", "Lora", "Warm editorial"],
  ["Cormorant Garamond", "Montserrat", "Fashion"],
  ["Oswald", "Raleway", "Commercial"],
  ["Great Vibes", "Raleway", "Romantic script"],
  ["Libre Baskerville", "Raleway", "Heritage"],
];

const field = "field h-9 py-1 text-sm";
const Lbl = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => (
  <label htmlFor={htmlFor} className="label">
    {children}
  </label>
);

export function Section({ title, children, open: o = true, testId }: { title: string; children: React.ReactNode; open?: boolean; testId?: string }) {
  const [open, setOpen] = useState(o);
  return (
    <section className="border-b border-line" data-testid={testId}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-semibold" aria-expanded={open}>
        {title}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------- Templates

export function TemplatesPanel({ doc, images, onPick }: { doc: TeaserDoc; images: ImageCache; onPick: (t: Template) => void }) {
  const list = doc.kind === "deck" ? DECK_TEMPLATES : TRAILER_TEMPLATES;
  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-muted">Switching keeps your details, photos and logo. Your manual edits to slides are replaced.</p>
      <div className="grid grid-cols-2 gap-2.5">
        {list.map((t) => (
          <TemplateCard key={t.id} t={t} doc={doc} images={images} onPick={onPick} active={doc.templateId === t.id} width={134} />
        ))}
      </div>
    </div>
  );
}

export function TemplateCard({ t, doc, images, onPick, active, width }: { t: Template; doc: TeaserDoc; images: ImageCache; onPick: (t: Template) => void; active?: boolean; width: number }) {
  const preview = useMemo(() => newDoc(t, { property: doc.property, agent: doc.agent, brand: doc.brand.logo ? { ...newDoc(t).brand, logo: doc.brand.logo } : undefined }), [t, doc.property, doc.agent, doc.brand.logo]);
  return (
    <button type="button" onClick={() => onPick(t)} data-template={t.id} className={`group spotlight relative overflow-hidden rounded-xl border bg-white p-1.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${active ? "border-bronze ring-2 ring-bronze/30" : "border-line"}`}>
      <div className="overflow-hidden rounded-lg">
        <SlideThumb doc={preview} slide={preview.slides[0]!} images={images} width={width} placeholders={false} />
      </div>
      <span className="mt-1.5 block truncate px-0.5 text-xs font-semibold">{t.name}</span>
      <span className="block truncate px-0.5 text-[10px] text-muted">{t.category}</span>
      {active && <Check size={14} className="absolute top-2.5 right-2.5 rounded-full bg-bronze p-0.5 text-white" aria-label="Current template" />}
    </button>
  );
}

// ---------------------------------------------------------------- Details

const KIND_OPTIONS = Object.values(KINDS).map((k) => k.label);

function ListEditor({ id, items, onChange, placeholder, max = 8 }: { id: string; items: string[]; onChange: (v: string[]) => void; placeholder: string; max?: number }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && items.length < max) onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="space-y-1.5">
      {items.map((h, i) => (
        <div key={`${i}-${h}`} className="flex items-center gap-1">
          <input aria-label={`${placeholder} ${i + 1}`} className={`${field} flex-1`} value={h} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" aria-label="Move up" disabled={!i} onClick={() => onChange(items.map((x, j) => (j === i - 1 ? items[i]! : j === i ? items[i - 1]! : x)))} className="ga-icon-btn size-7">
            <ArrowUp size={13} />
          </button>
          <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))} className="ga-icon-btn size-7 hover:text-bad">
            <X size={13} />
          </button>
        </div>
      ))}
      {items.length < max && (
        <div className="flex gap-1">
          <input
            id={id}
            className={`${field} flex-1`}
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="btn btn-ghost h-9 min-h-9 px-2.5" onClick={add} aria-label="Add">
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export function DetailsPanel({ grid, doc, setProp, setAgent, aiReady }: { grid: GridSDK; doc: TeaserDoc; setProp: (p: Partial<TeaserDoc["property"]>, commit?: boolean) => void; setAgent: (a: Partial<TeaserDoc["agent"]>) => void; aiReady: boolean }) {
  const p = doc.property;
  const a = doc.agent;
  const [notes, setNotes] = useState("");
  const [copy, setCopy] = useState<(CopyResult & { ai?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState(0);
  const [custom, setCustom] = useState("");
  const [listingQ, setListingQ] = useState("");
  const [listingHits, setListingHits] = useState<{ code: string; name: string; location: string }[]>([]);
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0));

  const write = () => setCopy(writeCopy(notes || p.description, p, seed));
  const polish = async () => {
    setBusy(true);
    try {
      const r = await grid.teaser.polish({ text: notes || p.description, details: { name: p.name, kind: p.kind, location: p.location, price: p.price, bedrooms: p.bedrooms, bathrooms: p.bathrooms, floorArea: p.floorArea, lotArea: p.lotArea, amenities: p.amenities.map((x) => amenityInfo(x).label) } });
      const base = writeCopy(notes || p.description, p, seed);
      setCopy({ ...base, taglines: r.taglines.length ? r.taglines : base.taglines, short: r.short || base.short, long: r.long || base.long, highlights: r.highlights.length ? r.highlights : base.highlights, ai: `${r.provider} · ${r.model}` });
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (listingQ.trim().length < 2) return;
    const t = setTimeout(() => {
      grid.listings
        .search({ query: listingQ.trim(), limit: 6 })
        .then((r) => setListingHits(r.listings.map((l) => ({ code: l.code, name: l.name, location: l.location }))))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [grid, listingQ]);

  const fromListing = async (code: string) => {
    const l = await grid.listings.get(code);
    if (!l) return;
    const c = writeCopy(`${l.name}\n${l.notes ?? ""}`, {}, 0);
    setProp({
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
      description: c.short || p.description,
      highlights: c.highlights.length ? c.highlights : p.highlights,
      amenities: [...new Set([...p.amenities, ...c.amenities])],
      tagline: c.taglines[0] ?? p.tagline,
    });
    setListingQ("");
    setListingHits([]);
    grid.ui.notify(`Filled from ${l.code}. Contact details of the uploader are not copied.`, { tone: "ok" });
  };

  const groups = useMemo(() => [...new Set(AMENITIES.map((x) => x.group))], []);

  return (
    <div data-testid="details-panel">
      <Section title="Start from a listing" open={!p.name}>
        <div className="relative">
          <Search size={14} className="absolute top-2.5 left-2.5 text-muted" aria-hidden />
          <input aria-label="Search listings" className={`${field} pl-8`} placeholder="Search by name, place or code" value={listingQ} onChange={(e) => setListingQ(e.target.value)} />
        </div>
        {(listingQ.trim().length < 2 ? [] : listingHits).map((l) => (
          <button key={l.code} type="button" onClick={() => fromListing(l.code)} className="block w-full rounded-lg border border-line px-2.5 py-1.5 text-left text-xs hover:border-bronze hover:bg-bronze-soft">
            <span className="block truncate font-medium">{l.name}</span>
            <span className="block truncate text-muted">
              {l.code} · {l.location}
            </span>
          </button>
        ))}
      </Section>

      <Section title="Property">
        <div>
          <Lbl htmlFor="d-name">Property name</Lbl>
          <input id="d-name" className={field} value={p.name} onChange={(e) => setProp({ name: e.target.value }, false)} onBlur={() => setProp({}, true)} />
        </div>
        <div>
          <Lbl htmlFor="d-tag">Tagline</Lbl>
          <input id="d-tag" className={field} value={p.tagline} onChange={(e) => setProp({ tagline: e.target.value }, false)} onBlur={() => setProp({}, true)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Lbl htmlFor="d-tx">For</Lbl>
            <select id="d-tx" className={field} value={p.transaction} onChange={(e) => setProp({ transaction: e.target.value as "sale" | "lease" })}>
              <option value="sale">Sale</option>
              <option value="lease">Lease / rent</option>
            </select>
          </div>
          <div>
            <Lbl htmlFor="d-kind">Type</Lbl>
            <input id="d-kind" list="kinds" className={field} value={p.kind} onChange={(e) => setProp({ kind: e.target.value }, false)} onBlur={() => setProp({}, true)} />
            <datalist id="kinds">
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </div>
          <div>
            <Lbl htmlFor="d-price">Price (₱){p.transaction === "lease" ? " / month" : ""}</Lbl>
            <input id="d-price" inputMode="numeric" className={field} value={p.price ?? ""} onChange={(e) => setProp({ price: num(e.target.value) }, false)} onBlur={() => setProp({}, true)} />
          </div>
          <div>
            <Lbl htmlFor="d-pnote">Price text (optional)</Lbl>
            <input id="d-pnote" className={field} placeholder="Starts at ₱8.5M" value={p.priceNote} onChange={(e) => setProp({ priceNote: e.target.value }, false)} onBlur={() => setProp({}, true)} />
          </div>
        </div>
        <div>
          <Lbl htmlFor="d-loc">Location</Lbl>
          <input id="d-loc" className={field} value={p.location} onChange={(e) => setProp({ location: e.target.value }, false)} onBlur={() => setProp({}, true)} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["bedrooms", "Bedrooms"],
              ["bathrooms", "Baths"],
              ["parking", "Parking"],
              ["floorArea", "Floor sqm"],
              ["lotArea", "Lot sqm"],
            ] as const
          ).map(([k, label]) => (
            <div key={k}>
              <Lbl htmlFor={`d-${k}`}>{label}</Lbl>
              <input id={`d-${k}`} inputMode="numeric" className={field} value={p[k] ?? ""} onChange={(e) => setProp({ [k]: num(e.target.value) }, false)} onBlur={() => setProp({}, true)} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Description" testId="copy-section">
        <div>
          <Lbl htmlFor="d-notes">Paste your notes or listing text</Lbl>
          <textarea id="d-notes" rows={4} className="field text-sm" placeholder="Anything: Facebook post, broker notes, developer brochure text…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn btn-dark h-9 min-h-9 px-3 text-xs" onClick={write} disabled={!notes.trim() && !p.description.trim() && !p.name}>
            <Wand2 size={14} aria-hidden /> Write it for me
          </button>
          {aiReady && (
            <button type="button" className="btn btn-ghost h-9 min-h-9 px-3 text-xs" onClick={polish} disabled={busy || (!notes.trim() && !p.description.trim())}>
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />} Polish with AI
            </button>
          )}
        </div>
        {!aiReady && <p className="text-[11px] text-muted">Works without AI: it cleans your text, picks the key sentences and finds facts and amenities. Add your own AI key in Settings for Polish with AI.</p>}
        {copy && (
          <div className="ga-rise space-y-2.5 rounded-xl border border-bronze/30 bg-bronze-soft/40 p-3 text-xs" data-testid="copy-result">
            {copy.ai && <p className="text-[10px] text-muted">Polished by {copy.ai}</p>}
            {copy.removed.length > 0 && <p className="text-[10px] text-muted">Removed from the text: {copy.removed.join(", ")}.</p>}
            <div>
              <div className="mb-1 flex items-center justify-between font-semibold">
                Taglines
                <button type="button" className="ga-icon-btn size-6" aria-label="More taglines" onClick={() => {
                  setSeed(seed + 1);
                  setCopy({ ...copy, taglines: writeCopy(notes || p.description, p, seed + 1).taglines });
                }}>
                  <RefreshCw size={12} />
                </button>
              </div>
              {copy.taglines.map((t) => (
                <button key={t} type="button" className="mb-1 block w-full rounded-lg bg-white px-2 py-1.5 text-left hover:ring-1 hover:ring-bronze" onClick={() => setProp({ tagline: t })}>
                  {t}
                </button>
              ))}
            </div>
            <div>
              <p className="mb-1 font-semibold">Short description</p>
              <p className="rounded-lg bg-white p-2 leading-relaxed">{copy.short}</p>
            </div>
            {copy.highlights.length > 0 && (
              <div>
                <p className="mb-1 font-semibold">Highlights</p>
                <ul className="list-disc rounded-lg bg-white py-2 pr-2 pl-6">
                  {copy.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            )}
            {copy.amenities.length > 0 && <p>Found: {copy.amenities.map((x) => amenityInfo(x).label).join(", ")}</p>}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="btn btn-dark h-8 min-h-8 px-3 text-xs"
                onClick={() => {
                  const f = copy.facts;
                  setProp({
                    description: copy.short,
                    tagline: p.tagline || copy.taglines[0] || "",
                    highlights: copy.highlights,
                    amenities: [...new Set([...p.amenities, ...copy.amenities])],
                    bedrooms: p.bedrooms ?? f.bedrooms ?? null,
                    bathrooms: p.bathrooms ?? f.bathrooms ?? null,
                    floorArea: p.floorArea ?? f.floorArea ?? null,
                    lotArea: p.lotArea ?? f.lotArea ?? null,
                    parking: p.parking ?? f.parking ?? null,
                    price: p.price ?? f.price ?? null,
                    kind: p.kind || f.kind || "",
                    location: p.location || f.location || f.city || "",
                    transaction: f.transaction ?? p.transaction,
                  });
                  setCopy(null);
                  grid.ui.notify("Applied to your design.", { tone: "ok" });
                }}
              >
                <Check size={13} aria-hidden /> Apply all
              </button>
              <button type="button" className="btn btn-ghost h-8 min-h-8 px-3 text-xs" onClick={() => setProp({ description: copy.long })}>
                Use the long version
              </button>
            </div>
          </div>
        )}
        <div>
          <Lbl htmlFor="d-desc">Description on the slides</Lbl>
          <textarea id="d-desc" rows={5} className="field text-sm" value={p.description} onChange={(e) => setProp({ description: e.target.value }, false)} onBlur={() => setProp({}, true)} />
          <p className="mt-1 text-right text-[10px] text-muted">{p.description.split(/\s+/).filter(Boolean).length} words</p>
        </div>
      </Section>

      <Section title={`Highlights (${p.highlights.length})`}>
        <ListEditor id="d-hl" items={p.highlights} onChange={(v) => setProp({ highlights: v })} placeholder="Add a highlight" max={6} />
      </Section>

      <Section title={`Features & amenities (${p.amenities.length})`} testId="amenities-section">
        {groups.map((g) => (
          <div key={g}>
            <p className="mb-1 text-[10px] font-semibold tracking-wider text-muted uppercase">{g}</p>
            <div className="flex flex-wrap gap-1">
              {AMENITIES.filter((x) => x.group === g).map((x) => {
                const on = p.amenities.includes(x.id);
                return (
                  <button key={x.id} type="button" aria-pressed={on} onClick={() => setProp({ amenities: on ? p.amenities.filter((y) => y !== x.id) : [...p.amenities, x.id] })} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition-colors ${on ? "border-bronze bg-bronze text-white" : "border-line bg-white hover:border-bronze"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={iconDataUrl(x.icon, on ? "#ffffff" : "#5b6472", 28)} alt="" width={12} height={12} />
                    {x.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {p.amenities.filter((x) => x.startsWith("custom:")).map((x) => (
          <span key={x} className="mr-1 inline-flex items-center gap-1 rounded-full bg-bronze px-2 py-1 text-[11px] text-white">
            {x.slice(7)}
            <button type="button" aria-label={`Remove ${x.slice(7)}`} onClick={() => setProp({ amenities: p.amenities.filter((y) => y !== x) })}>
              <X size={11} />
            </button>
          </span>
        ))}
        <div className="flex gap-1">
          <input aria-label="Add your own feature" className={`${field} flex-1`} placeholder="Add your own (e.g. Rooftop bar)" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) {
              e.preventDefault();
              setProp({ amenities: [...p.amenities, `custom:${custom.trim().slice(0, 40)}`] });
              setCustom("");
            }
          }} />
        </div>
        <p className="text-[10px] text-muted">The order you tick them is the order on the slides (up to 12).</p>
      </Section>

      <Section title="Location & terms" open={false}>
        <div>
          <Lbl htmlFor="d-near">Nearby places</Lbl>
          <ListEditor id="d-near" items={p.nearby} onChange={(v) => setProp({ nearby: v })} placeholder="School, mall, station…" max={6} />
        </div>
        <div>
          <Lbl htmlFor="d-terms">Payment terms</Lbl>
          <textarea id="d-terms" rows={3} className="field text-sm" value={p.paymentTerms} onChange={(e) => setProp({ paymentTerms: e.target.value }, false)} onBlur={() => setProp({}, true)} />
        </div>
      </Section>

      <Section title="Your contact details" open={!a.name}>
        {(
          [
            ["name", "Name"],
            ["title", "Title (e.g. Licensed Real Estate Broker)"],
            ["phone", "Phone"],
            ["email", "Email"],
            ["license", "PRC license number"],
            ["company", "Company"],
            ["website", "Website"],
          ] as const
        ).map(([k, label]) => (
          <div key={k}>
            <Lbl htmlFor={`a-${k}`}>{label}</Lbl>
            <input id={`a-${k}`} className={field} value={a[k]} onChange={(e) => setAgent({ [k]: e.target.value })} />
          </div>
        ))}
        <p className="text-[10px] text-muted">Saved with this project and reused when you start a new one.</p>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- Brand

export function BrandPanel({ grid, doc, setBrand, onTemplateColors }: { grid: GridSDK; doc: TeaserDoc; setBrand: (b: Partial<TeaserDoc["brand"]>) => void; onTemplateColors: () => void }) {
  const b = doc.brand;
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (f: File) => {
    setBusy(true);
    try {
      const img = await prepareImage(f, { max: 1200, keepAlpha: true });
      const a = await grid.teaser.addAsset({ ...img, source: "logo", name: f.name });
      setBrand({ logo: a.src });
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Section title="Logo">
        <div className="grid h-24 place-items-center rounded-xl border border-dashed border-line-2 bg-[repeating-conic-gradient(#f4f1ec_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {b.logo ? <img src={b.logo.startsWith("asset:") ? `/api/teaser-assets/${b.logo.slice(6)}` : b.logo} alt="Your logo" className="max-h-20 max-w-[85%] object-contain" /> : <span className="text-xs text-muted">No logo yet</span>}
        </div>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" aria-label="Upload logo" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <div className="flex gap-1.5">
          <button type="button" className="btn btn-dark h-9 min-h-9 flex-1 px-3 text-xs" disabled={busy} onClick={() => file.current?.click()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {b.logo ? "Replace logo" : "Upload logo"}
          </button>
          {b.logo && (
            <button type="button" className="btn btn-ghost h-9 min-h-9 px-3 text-xs" onClick={() => setBrand({ logo: null })}>
              Remove
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted">PNG or SVG with a transparent background looks best. It appears wherever the template has a logo spot.</p>
      </Section>
      <Section title="Colours">
        {(
          [
            ["primary", "Main"],
            ["accent", "Accent"],
            ["secondary", "Soft"],
            ["ink", "Text"],
            ["paper", "Background"],
          ] as const
        ).map(([k, label]) => (
          <div key={k} className="flex items-center gap-2">
            <input type="color" aria-label={`${label} colour`} value={b[k].slice(0, 7)} onChange={(e) => setBrand({ [k]: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-line bg-white p-0.5" />
            <span className="flex-1 text-xs">{label}</span>
            <input aria-label={`${label} hex`} className="field h-8 w-24 py-0 font-mono text-xs" value={b[k]} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && setBrand({ [k]: e.target.value })} />
          </div>
        ))}
        <button type="button" className="text-xs underline" onClick={onTemplateColors}>
          Reset to the template&apos;s colours and fonts
        </button>
      </Section>
      <Section title="Fonts">
        <div className="grid grid-cols-2 gap-1.5">
          {FONT_PAIRS.map(([h, body, label]) => (
            <button key={label} type="button" onClick={() => setBrand({ headFont: h, bodyFont: body })} className={`rounded-lg border p-2 text-left transition-colors hover:border-bronze ${b.headFont === h && b.bodyFont === body ? "border-bronze bg-bronze-soft" : "border-line"}`}>
              <span className="block truncate text-base leading-tight" style={{ fontFamily: `"${h}"` }}>
                Aa {h.split(" ")[0]}
              </span>
              <span className="block truncate text-[10px] text-muted" style={{ fontFamily: `"${body}"` }}>
                {label}
              </span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Lbl htmlFor="b-head">Headings</Lbl>
            <select id="b-head" className={field} value={b.headFont} onChange={(e) => setBrand({ headFont: e.target.value })}>
              {FONTS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <Lbl htmlFor="b-body">Body text</Lbl>
            <select id="b-body" className={field} value={b.bodyFont} onChange={(e) => setBrand({ bodyFont: e.target.value })}>
              {FONTS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- Elements

const SHAPES: [ShapeKind, string, number?][] = [
  ["rect", "Square"],
  ["rect", "Rounded", 24],
  ["pill", "Pill"],
  ["ellipse", "Circle"],
  ["triangle", "Triangle"],
  ["diamond", "Diamond"],
  ["star", "Star"],
  ["arrow", "Arrow"],
  ["line", "Line"],
];

export function ElementsPanel({ doc, add }: { doc: TeaserDoc; add: (el: El) => void }) {
  const [q, setQ] = useState("");
  const W = doc.width;
  const H = doc.height;
  const icons = ICON_NAMES.filter((n) => !q || n.includes(q.toLowerCase().trim()));
  const text = (o: Partial<Extract<El, { type: "text" }>>) => add({ id: uid(), type: "text", x: W * 0.2, y: H * 0.4, w: W * 0.6, h: 100, text: "Your text", font: "$body", size: 40, weight: 400, color: "$ink", align: "center", lineHeight: 1.3, ...o } as El);
  return (
    <div>
      <Section title="Text">
        <button type="button" className="block w-full rounded-lg border border-line bg-white px-3 py-2 text-left text-xl font-bold hover:border-bronze" style={{ fontFamily: `"${doc.brand.headFont}"` }} onClick={() => text({ text: "Add a heading", font: "$head", size: 96, weight: 700, lineHeight: 1.1, h: 120 })}>
          Add a heading
        </button>
        <button type="button" className="block w-full rounded-lg border border-line bg-white px-3 py-2 text-left text-base font-semibold hover:border-bronze" onClick={() => text({ text: "Add a subheading", size: 56, weight: 700, h: 80 })}>
          Add a subheading
        </button>
        <button type="button" className="block w-full rounded-lg border border-line bg-white px-3 py-2 text-left text-sm hover:border-bronze" onClick={() => text({ text: "Add a little bit of body text", size: 34, align: "left" })}>
          Add body text
        </button>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className="rounded-lg bg-[#be8562] px-2 py-2 text-xs font-bold tracking-widest text-white uppercase" onClick={() => text({ text: "For sale", size: 30, weight: 700, upper: true, spacing: 5, color: "$paper", bg: "$accent", pad: 18, radius: 40, w: 340, x: W / 2 - 170 })}>
            Badge
          </button>
          <button type="button" className="rounded-lg border border-line bg-white px-2 py-2 text-xs font-bold hover:border-bronze" onClick={() => add({ id: uid(), type: "text", x: W * 0.3, y: H * 0.45, w: W * 0.4, h: 90, text: "", bind: "property.price", font: "$head", size: 72, weight: 700, color: "$primary", align: "center", lineHeight: 1.1 } as El)}>
            ₱ Price (live)
          </button>
          <button type="button" className="rounded-lg border border-line bg-white px-2 py-2 text-xs hover:border-bronze" onClick={() => add({ id: uid(), type: "text", x: W * 0.2, y: H * 0.45, w: W * 0.6, h: 60, text: "", bind: "agent.contact", font: "$body", size: 34, weight: 400, color: "$ink", align: "center", lineHeight: 1.3 } as El)}>
            Contact (live)
          </button>
          <button type="button" className="rounded-lg border border-line bg-white px-2 py-2 text-xs hover:border-bronze" onClick={() => add({ id: uid(), type: "image", x: W - 320, y: 60, w: 240, h: 100, src: null, fit: "contain", bind: "brand.logo", name: "Logo" } as El)}>
            Logo (live)
          </button>
        </div>
      </Section>
      <Section title="Shapes">
        <div className="grid grid-cols-3 gap-1.5">
          {SHAPES.map(([shape, label, radius]) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={`Add ${label.toLowerCase()}`}
              onClick={() => add({ id: uid(), type: "shape", shape, x: W / 2 - 160, y: H / 2 - (shape === "line" ? 3 : 160), w: shape === "pill" ? 420 : 320, h: shape === "line" ? 6 : shape === "pill" ? 120 : 320, fill: "$accent", radius } as El)}
              className="grid h-14 place-items-center rounded-lg border border-line bg-white hover:border-bronze"
            >
              <span
                className="block bg-[#be8562]"
                style={{
                  width: shape === "pill" ? 34 : shape === "line" ? 30 : 24,
                  height: shape === "line" ? 3 : shape === "pill" ? 14 : 24,
                  borderRadius: shape === "ellipse" || shape === "pill" ? 999 : radius ? 6 : 0,
                  clipPath: shape === "triangle" ? "polygon(50% 0,100% 100%,0 100%)" : shape === "diamond" ? "polygon(50% 0,100% 50%,50% 100%,0 50%)" : shape === "star" ? "polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)" : shape === "arrow" ? "polygon(0 30%,62% 30%,62% 0,100% 50%,62% 100%,62% 70%,0 70%)" : undefined,
                }}
              />
            </button>
          ))}
        </div>
      </Section>
      <Section title={`Icons (${ICON_NAMES.length})`}>
        <input aria-label="Search icons" className={field} placeholder="Search icons: bed, pool, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid max-h-72 grid-cols-6 gap-1 overflow-auto">
          {icons.map((n) => (
            <button key={n} type="button" title={n.replace(/-/g, " ")} aria-label={`Add icon ${n.replace(/-/g, " ")}`} onClick={() => add({ id: uid(), type: "icon", icon: n, x: W / 2 - 60, y: H / 2 - 60, w: 120, h: 120, color: "$accent", strokeW: 1.75 } as El)} className="grid aspect-square place-items-center rounded-lg hover:bg-sand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={iconDataUrl(n, "#243447", 40)} alt="" width={20} height={20} />
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- Photos

export function PhotosPanel({
  grid,
  doc,
  images,
  canReplace,
  onUse,
  setPhotos,
}: {
  grid: GridSDK;
  doc: TeaserDoc;
  images: ImageCache;
  /** A photo frame is selected: picking replaces it. */
  canReplace: boolean;
  onUse: (src: string, credit?: string) => void;
  setPhotos: (photos: string[]) => void;
}) {
  const [tab, setTab] = useState<"mine" | "web">("mine");
  const [assets, setAssets] = useState<TeaserAsset[]>([]);
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<WebImage[] | null>(null);
  const [link, setLink] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const photos = doc.property.photos;
  const load = () => grid.teaser.assets().then((a) => setAssets(a.filter((x) => x.source !== "logo"))).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);
  void images;

  const upload = async (files: FileList) => {
    const added: string[] = [];
    for (const [i, f] of [...files].slice(0, 20).entries()) {
      setBusy(`Uploading ${i + 1} of ${Math.min(20, files.length)}…`);
      try {
        const img = await prepareImage(f);
        const a = await grid.teaser.addAsset({ ...img, source: "upload", name: f.name });
        added.push(a.src);
      } catch (e) {
        grid.ui.notify(`${f.name}: ${errText(e)}`, { tone: "bad" });
      }
    }
    setBusy("");
    if (added.length) setPhotos([...photos, ...added]);
    load();
  };
  const search = async () => {
    if (!q.trim()) return;
    setBusy("Searching…");
    try {
      setResults((await grid.teaser.searchWeb(q)).results);
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
      setResults([]);
    } finally {
      setBusy("");
    }
  };
  const importWeb = async (url: string, credit?: string, name?: string) => {
    setBusy("Importing…");
    try {
      const a = await grid.teaser.importUrl({ url, credit, name });
      await load();
      if (canReplace) onUse(a.src, a.credit);
      else setPhotos([...photos, a.src]);
      grid.ui.notify(canReplace ? "Photo replaced." : "Added to property photos.", { tone: "ok" });
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    } finally {
      setBusy("");
    }
  };
  const thumbUrl = (src: string) => `/api/teaser-assets/${src.slice(6)}`;

  return (
    <div>
      <Section title={`Property photos (${photos.length})`}>
        <p className="text-[11px] text-muted">Templates fill their photo frames from this list: the first is the cover photo. {canReplace && <strong>A frame is selected: click any image below to put it there.</strong>}</p>
        <input ref={file} type="file" multiple accept="image/*" className="sr-only" aria-label="Upload photos" onChange={(e) => e.target.files && upload(e.target.files)} />
        <button type="button" className="btn btn-dark h-9 min-h-9 w-full text-xs" disabled={!!busy} onClick={() => file.current?.click()}>
          {busy && busy.startsWith("Uploading") ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} {busy.startsWith("Uploading") ? busy : "Upload photos"}
        </button>
        <ul className="grid grid-cols-3 gap-1.5" aria-label="Property photos in order">
          {photos.map((src, i) => (
            <li key={`${src}-${i}`} className="group relative overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(src)} alt={`Photo ${i + 1}`} className="aspect-[4/3] w-full cursor-pointer object-cover" onClick={() => canReplace && onUse(src)} />
              <span className="absolute top-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">{i === 0 ? "Cover" : i + 1}</span>
              <span className="absolute right-1 bottom-1 hidden gap-0.5 group-hover:flex">
                <button type="button" aria-label="Move earlier" disabled={!i} className="rounded bg-white/90 p-0.5" onClick={() => setPhotos(photos.map((x, j) => (j === i - 1 ? photos[i]! : j === i ? photos[i - 1]! : x)))}>
                  <ArrowUp size={11} />
                </button>
                <button type="button" aria-label="Move later" disabled={i === photos.length - 1} className="rounded bg-white/90 p-0.5" onClick={() => setPhotos(photos.map((x, j) => (j === i + 1 ? photos[i]! : j === i ? photos[i + 1]! : x)))}>
                  <ArrowDown size={11} />
                </button>
                <button type="button" aria-label="Remove from property photos" className="rounded bg-white/90 p-0.5 text-bad" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                  <X size={11} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="flex gap-1 px-4 pt-3" role="tablist" aria-label="Image sources">
        {(
          [
            ["mine", "My images"],
            ["web", "From the web"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1 text-xs ${tab === k ? "bg-navy text-cream" : "bg-sand"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "mine" ? (
        <div className="p-4">
          {assets.length === 0 && <p className="text-xs text-muted">Images you upload or import appear here.</p>}
          <div className="grid grid-cols-3 gap-1.5">
            {assets.map((a) => (
              <div key={a.id} className="group relative overflow-hidden rounded-lg">
                <button type="button" title={a.credit || a.name} onClick={() => onUse(a.src, a.credit || undefined)} className="block w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrl(a.src)} alt={a.name} className="aspect-square w-full object-cover" loading="lazy" />
                </button>
                <span className="absolute right-1 bottom-1 hidden gap-0.5 group-hover:flex">
                  {!photos.includes(a.src) && (
                    <button type="button" aria-label="Add to property photos" title="Add to property photos" className="rounded bg-white/90 p-0.5" onClick={() => setPhotos([...photos, a.src])}>
                      <Plus size={11} />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Delete image"
                    className="rounded bg-white/90 p-0.5 text-bad"
                    onClick={async () => {
                      if (!(await grid.ui.confirm("Delete this image from your library? Slides using it will show an empty frame.", { danger: true, okLabel: "Delete" }))) return;
                      await grid.teaser.deleteAsset(a.id).catch(() => {});
                      setPhotos(photos.filter((x) => x !== a.src));
                      load();
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted">Click an image to {canReplace ? "put it in the selected frame" : "add it to the slide"}.</p>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <input aria-label="Search free images" className={`${field} flex-1`} placeholder="modern living room, beach, skyline…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="submit" className="btn btn-dark h-9 min-h-9 px-3" aria-label="Search" disabled={!!busy}>
              {busy === "Searching…" ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            </button>
          </form>
          <p className="text-[10px] text-muted">Free Creative Commons photos from Openverse that allow commercial use. The credit line is saved with each image; keep it in your design or notes. Use only photos of the actual property for claims about it.</p>
          {results && results.length === 0 && <p className="text-xs text-muted">No results.</p>}
          <div className="grid grid-cols-2 gap-1.5">
            {results?.map((r) => (
              <button key={r.id} type="button" title={r.credit} onClick={() => importWeb(r.url, r.credit, r.title)} className="group relative overflow-hidden rounded-lg text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.thumb} alt={r.title} className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[9px] text-white">
                  {r.creator} · {r.license}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-line pt-3">
            <Lbl htmlFor="w-link">Or paste an image link</Lbl>
            <div className="flex gap-1">
              <input id="w-link" className={`${field} flex-1`} placeholder="https://…/photo.jpg" value={link} onChange={(e) => setLink(e.target.value)} />
              <button type="button" className="btn btn-ghost h-9 min-h-9 px-3" aria-label="Import link" disabled={!link.trim() || !!busy} onClick={() => importWeb(link.trim()).then(() => setLink(""))}>
                {busy === "Importing…" ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-muted">Only use pictures you have the right to use.</p>
          </div>
        </div>
      )}
    </div>
  );
}
