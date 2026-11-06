"use client";
/**
 * Deal Desk → Property Teaser intake card (in the chat).
 *  Guided: choose what to add (photos, logo, details…), then one step each.
 *  Customize: everything in one box, plus pictures.
 * Then: the details as an editable sheet with the spelling fixes listed, and the outputs
 * PowerPoint (made here), Excel (the sheet) or "Open in Property Teaser" (saved as a project).
 */
import { ArrowLeft, ArrowRight, Check, FileSpreadsheet, ImagePlus, Loader2, Presentation, Sparkles, Undo2, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { errText } from "@/components/apps/use-grid";
import { prepareImage, download, safeName } from "@/components/teaser/images";
import { SECTIONS, fromRows, sheetTable, toRows, understand, type Row, type SectionId, type Sections } from "@/lib/teaser/intake";
import { fromDesign } from "@/lib/teaser/listing";
import { srcUrl } from "@/lib/teaser/render";
import { DECK_TEMPLATES, TRAILER_TEMPLATES, applyGenerators, brandFrom, newDoc, templateById } from "@/lib/teaser/templates";
import { emptyProperty, type TeaserDoc } from "@/lib/teaser/types";
import type { Correction } from "@/lib/teaser/spell";
import type { GridSDK, SavedDesign } from "@/lib/sdk/types";
import type { IntakeSpec } from "./command-menu";

type Stage = "choose" | "input" | "sheet";
const TEXT_SECTIONS: SectionId[] = ["details", "features", "price", "contact"];

function Drop({ grid, label, multiple, source, onAdd, testId }: { grid: GridSDK; label: string; multiple?: boolean; source: "upload" | "logo"; onAdd: (srcs: string[]) => void; testId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const add = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/")).slice(0, multiple ? 12 : 1);
    if (!imgs.length) return;
    setBusy(true);
    const out: string[] = [];
    for (const f of imgs) {
      try {
        const img = await prepareImage(f, { max: source === "logo" ? 1200 : 2560 });
        const a = await grid.teaser.addAsset({ ...img, source, name: f.name });
        out.push(a.src);
      } catch (e) {
        grid.ui.notify(`${f.name}: ${errText(e)}`, { tone: "bad" });
      }
    }
    setBusy(false);
    if (out.length) onAdd(out);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        add([...e.dataTransfer.files]);
      }}
      className={`flex items-center gap-3 rounded-xl border border-dashed px-3 py-3 text-xs transition-colors ${over ? "border-bronze bg-bronze-soft" : "border-line bg-sand/40"}`}
    >
      <ImagePlus size={18} className="shrink-0 text-bronze-ink" aria-hidden />
      <span className="text-muted">Drop {multiple ? "pictures" : "a picture"} here, or</span>
      <button type="button" className="btn btn-ghost h-7 min-h-7 px-2.5 text-xs" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : null} {label}
      </button>
      <input ref={ref} data-testid={testId} type="file" accept="image/*" multiple={multiple} className="sr-only" aria-label={label} onChange={(e) => add([...(e.target.files ?? [])])} />
    </div>
  );
}

function Thumbs({ srcs, onRemove }: { srcs: string[]; onRemove: (i: number) => void }) {
  if (!srcs.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Pictures added">
      {srcs.map((s, i) => (
        <li key={s} className="group relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={srcUrl(s) ?? ""} alt={`Picture ${i + 1}`} className="size-14 rounded-lg border border-line object-cover" />
          {i === 0 && <span className="absolute bottom-0.5 left-0.5 rounded bg-navy/80 px-1 text-[9px] text-cream">Cover</span>}
          <button type="button" aria-label={`Remove picture ${i + 1}`} onClick={() => onRemove(i)} className="absolute -top-1.5 -right-1.5 hidden rounded-full bg-white p-0.5 shadow group-hover:block">
            <X size={11} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function TeaserIntake({ grid, spec, onClose }: { grid: GridSDK; spec: IntakeSpec; onClose: () => void }) {
  const what = spec.kind === "trailer" ? "teaser trailer" : "presentation";
  const [mode, setMode] = useState(spec.mode);
  const [stage, setStage] = useState<Stage>(spec.mode === "guided" ? "choose" : "input");
  const [chosen, setChosen] = useState<SectionId[]>(["photos", "logo", "details", "features", "price", "contact"]);
  const [step, setStep] = useState(0);
  const [text, setText] = useState<Sections>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [fixes, setFixes] = useState<Correction[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const templates = spec.kind === "deck" ? DECK_TEMPLATES : TRAILER_TEMPLATES;
  const [design, setDesign] = useState(spec.designId ? `mine:${spec.designId}` : templates[0]!.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [made, setMade] = useState<string[]>([]);

  useEffect(() => {
    grid.teaser
      .templates()
      .then((r) => setDesigns(r.filter((d) => d.kind === spec.kind)))
      .catch(() => {});
  }, [grid, spec.kind]);

  const steps = useMemo(() => SECTIONS.filter((s) => chosen.includes(s.id)), [chosen]);
  const cur = steps[step];

  const run = () => {
    const u = understand(mode === "customize" ? { all: text.all ?? "" } : Object.fromEntries(TEXT_SECTIONS.filter((k) => chosen.includes(k)).map((k) => [k, text[k] ?? ""])));
    setRows(toRows(u.property, u.agent));
    setFixes(u.corrections);
    setNotes(u.notes);
    setStage("sheet");
  };

  const undoFix = (c: Correction) => {
    const re = new RegExp(`\\b${c.to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    setRows((rs) => rs.map((r) => ({ ...r, value: r.value.replace(re, c.from) })));
    setFixes((f) => f.filter((x) => x !== c));
  };

  const buildDoc = async (): Promise<TeaserDoc> => {
    const { property, agent } = fromRows(rows, { ...emptyProperty(), photos });
    if (design.startsWith("mine:")) {
      const r = await grid.teaser.getTemplate(design.slice(5));
      const d = r.data as unknown as TeaserDoc;
      const doc = fromDesign(d, property);
      return { ...doc, agent: agent.name || agent.phone || agent.email ? agent : d.agent, brand: { ...doc.brand, logo: logo ?? doc.brand.logo } };
    }
    const t = templateById(design) ?? templates[0]!;
    return applyGenerators(newDoc(t, { property, agent, brand: brandFrom(t, logo) }));
  };
  const title = () => rows.find((r) => r.key === "name")?.value.trim() || `New ${what}`;

  const toPptx = async () => {
    setBusy("Making the PowerPoint…");
    try {
      const [{ exportPptx }, { ImageCache }] = await Promise.all([import("@/components/teaser/export"), import("@/lib/teaser/render")]);
      const doc = await buildDoc();
      download(await exportPptx(doc, new ImageCache(), title()), `${safeName(title())}.pptx`);
      setMade((m) => [...new Set([...m, "PowerPoint"])]);
      grid.ui.notify("PowerPoint downloaded. Find it in your Downloads folder.", { tone: "ok" });
    } catch (e) {
      grid.ui.notify(`PowerPoint failed: ${errText(e)}`, { tone: "bad" });
    } finally {
      setBusy(null);
    }
  };
  const toXlsx = async () => {
    setBusy("Making the Excel file…");
    try {
      const { writeXlsx } = await import("@/lib/teaser/xlsx");
      download(await writeXlsx([{ name: "Property", rows: sheetTable(rows, photos.length), widths: [16, 28, 70] }]), `${safeName(title())}.xlsx`);
      setMade((m) => [...new Set([...m, "Excel"])]);
      grid.ui.notify("Excel file downloaded.", { tone: "ok" });
    } catch (e) {
      grid.ui.notify(`Excel failed: ${errText(e)}`, { tone: "bad" });
    } finally {
      setBusy(null);
    }
  };
  const toEditor = async () => {
    setBusy("Saving the project…");
    try {
      const doc = await buildDoc();
      const r = await grid.teaser.save({ kind: doc.kind, title: title().slice(0, 120), templateId: doc.templateId, data: doc as unknown as Record<string, unknown> });
      setMade((m) => [...new Set([...m, "Property Teaser project"])]);
      await grid.ui.openApp("property-teaser", { project: r.id });
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    } finally {
      setBusy(null);
    }
  };

  const setRow = (key: string, value: string) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, value } : r)));
  const field = "field w-full text-sm";

  return (
    <section className="ga-rise rounded-2xl border border-line bg-white shadow-sm" aria-label={`New ${what}`} data-testid="teaser-intake">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-bronze-soft text-bronze-ink">
          <Presentation size={15} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            New {what}
            {spec.designName ? ` · ${spec.designName}` : ""}
          </p>
          <p className="text-[11px] text-muted">{stage === "choose" ? "What do you want to add?" : stage === "input" ? (mode === "customize" ? "Everything in one go" : `Step ${step + 1} of ${steps.length}: ${cur?.label ?? ""}`) : "Check the details, then choose an output"}</p>
        </div>
        <button type="button" aria-label="Close" className="ga-icon-btn ml-auto size-7" onClick={onClose}>
          <X size={14} />
        </button>
      </header>

      <div className="space-y-3 p-4">
        {stage === "choose" && (
          <>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="What to add">
              {SECTIONS.map((s) => {
                const on = chosen.includes(s.id);
                return (
                  <button key={s.id} type="button" aria-pressed={on} title={s.hint} onClick={() => setChosen((c) => (on ? c.filter((x) => x !== s.id) : SECTIONS.map((x) => x.id).filter((x) => x === s.id || c.includes(x))))} className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition-colors ${on ? "bg-navy text-cream" : "bg-white ring-1 ring-line hover:ring-bronze"}`}>
                    {on && <Check size={12} />} {s.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-dark h-9 min-h-9 px-4 text-sm" disabled={!chosen.length} onClick={() => (setStep(0), setStage("input"))}>
                Start <ArrowRight size={14} />
              </button>
              <button type="button" className="btn btn-ghost h-9 min-h-9 px-3 text-xs" onClick={() => (setMode("customize"), setStage("input"))}>
                <Wand2 size={13} /> Customize: all in one go
              </button>
            </div>
          </>
        )}

        {stage === "input" && mode === "customize" && (
          <>
            <label htmlFor="intake-all" className="block text-xs font-medium">
              Type or paste everything about the property
            </label>
            <textarea
              id="intake-all"
              rows={7}
              className={field}
              value={text.all ?? ""}
              onChange={(e) => setText({ ...text, all: e.target.value })}
              placeholder={"Name, type, location, size, rooms, features, amenities, nearby places, price, payment terms and your contact details. Spelling mistakes are fine.\n\ne.g. Verde Residences, 2BR condo in Alabang, 68 sqm, swimming pool and gym, near Festival Mall. ₱8.5M, 20% DP in 24 months. Ana Cruz 0917 123 4567"}
            />
            <p className="text-xs font-medium">Pictures</p>
            <Drop grid={grid} label="Choose pictures" multiple source="upload" onAdd={(s) => setPhotos((p) => [...p, ...s].slice(0, 24))} testId="intake-photos" />
            <Thumbs srcs={photos} onRemove={(i) => setPhotos((p) => p.filter((_, j) => j !== i))} />
            <p className="text-xs font-medium">Logo</p>
            <Drop grid={grid} label="Choose a logo" source="logo" onAdd={(s) => setLogo(s[0]!)} testId="intake-logo" />
            <Thumbs srcs={logo ? [logo] : []} onRemove={() => setLogo(null)} />
            <button type="button" className="btn btn-dark h-9 min-h-9 px-4 text-sm" disabled={!(text.all ?? "").trim()} onClick={run}>
              <Sparkles size={14} /> Understand it
            </button>
          </>
        )}

        {stage === "input" && mode === "guided" && cur && (
          <>
            <p className="text-xs text-muted">{cur.hint}</p>
            {cur.id === "photos" ? (
              <>
                <Drop grid={grid} label="Choose pictures" multiple source="upload" onAdd={(s) => setPhotos((p) => [...p, ...s].slice(0, 24))} testId="intake-photos" />
                <Thumbs srcs={photos} onRemove={(i) => setPhotos((p) => p.filter((_, j) => j !== i))} />
              </>
            ) : cur.id === "logo" ? (
              <>
                <Drop grid={grid} label="Choose a logo" source="logo" onAdd={(s) => setLogo(s[0]!)} testId="intake-logo" />
                <Thumbs srcs={logo ? [logo] : []} onRemove={() => setLogo(null)} />
              </>
            ) : (
              <textarea aria-label={cur.label} rows={4} className={field} autoFocus value={text[cur.id] ?? ""} onChange={(e) => setText({ ...text, [cur.id]: e.target.value })} placeholder={cur.placeholder} />
            )}
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-ghost h-9 min-h-9 px-3 text-xs" onClick={() => (step ? setStep(step - 1) : setStage("choose"))}>
                <ArrowLeft size={13} /> Back
              </button>
              {step < steps.length - 1 ? (
                <button type="button" className="btn btn-dark h-9 min-h-9 px-4 text-sm" onClick={() => setStep(step + 1)}>
                  Next <ArrowRight size={14} />
                </button>
              ) : (
                <button type="button" className="btn btn-dark h-9 min-h-9 px-4 text-sm" onClick={run}>
                  <Sparkles size={14} /> Understand it
                </button>
              )}
            </div>
          </>
        )}

        {stage === "sheet" && (
          <>
            {fixes.length > 0 && (
              <div className="rounded-xl bg-ok-soft/60 px-3 py-2 text-xs" data-testid="intake-fixes">
                <p className="font-medium">
                  Fixed {fixes.length} spelling{fixes.length === 1 ? "" : "s"}:
                </p>
                <ul className="mt-1 flex flex-wrap gap-1">
                  {fixes.map((c) => (
                    <li key={c.from} className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 ring-1 ring-line">
                      <s className="text-muted">{c.from}</s> → {c.to}
                      <button type="button" aria-label={`Undo ${c.to}`} title="Undo" onClick={() => undoFix(c)} className="text-muted hover:text-ink">
                        <Undo2 size={11} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {notes.map((n) => (
              <p key={n} className="text-xs text-muted">
                {n}
              </p>
            ))}
            <div className="max-h-[26rem] overflow-y-auto rounded-xl border border-line" data-testid="intake-sheet">
              <table className="w-full text-xs">
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.key} className="border-b border-line last:border-0 align-top">
                      {(i === 0 || rows[i - 1]!.group !== r.group) && (
                        <th scope="rowgroup" rowSpan={rows.filter((x) => x.group === r.group).length} className="w-20 bg-sand/60 px-2 py-1.5 text-left text-[10px] font-semibold tracking-wide text-muted uppercase">
                          {r.group}
                        </th>
                      )}
                      <th scope="row" className="w-36 px-2 py-1.5 text-left font-medium">
                        <label htmlFor={`sheet-${r.key}`}>{r.label}</label>
                      </th>
                      <td className="px-1 py-1">
                        {r.long ? (
                          <textarea id={`sheet-${r.key}`} rows={Math.min(5, Math.max(2, r.value.split("\n").length))} className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 hover:border-line focus:border-line focus:bg-white focus:outline-none" value={r.value} onChange={(e) => setRow(r.key, e.target.value)} />
                        ) : (
                          <input id={`sheet-${r.key}`} className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 hover:border-line focus:border-line focus:bg-white focus:outline-none" value={r.value} onChange={(e) => setRow(r.key, e.target.value)} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(photos.length > 0 || logo) && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Thumbs srcs={photos} onRemove={(i) => setPhotos((p) => p.filter((_, j) => j !== i))} />
                {logo && <Thumbs srcs={[logo]} onRemove={() => setLogo(null)} />}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
              <div className="min-w-48 flex-1">
                <label htmlFor="intake-design" className="block text-[11px] text-muted">
                  Design
                </label>
                <select id="intake-design" className="field h-9 w-full text-sm" value={design} onChange={(e) => setDesign(e.target.value)}>
                  {designs.length > 0 && (
                    <optgroup label="My designs">
                      {designs.map((d) => (
                        <option key={d.id} value={`mine:${d.id}`}>
                          {d.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Templates">
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.category}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <button type="button" className="btn btn-dark h-9 min-h-9 px-3 text-sm" disabled={!!busy} onClick={toPptx}>
                <Presentation size={14} /> PowerPoint
              </button>
              <button type="button" className="btn btn-ghost h-9 min-h-9 px-3 text-sm" disabled={!!busy} onClick={toXlsx}>
                <FileSpreadsheet size={14} /> Excel
              </button>
              <button type="button" className="btn btn-ghost h-9 min-h-9 px-3 text-sm" disabled={!!busy} onClick={toEditor}>
                Open in Property Teaser
              </button>
            </div>
            <p className="text-[11px] text-muted" role="status" data-testid="intake-status">
              {busy ?? (made.length ? `Done: ${made.join(", ")}.` : "PowerPoint uses the design you pick; open it in Property Teaser to fine-tune the slides or make a video.")}
            </p>
            <button type="button" className="btn btn-ghost h-8 min-h-8 px-2.5 text-xs" onClick={() => setStage("input")}>
              <ArrowLeft size={13} /> Change what I wrote
            </button>
          </>
        )}
      </div>
    </section>
  );
}
