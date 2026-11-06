"use client";
/** Property Teaser editor: panels, canvas, toolbar, slides, preview player, autosave and exports. */
import {
  ArrowLeft,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileImage,
  FileText,
  Film,
  Image as ImageLucide,
  LayoutTemplate,
  Loader2,
  Minus,
  Palette,
  Pause,
  Play,
  Plus,
  Presentation,
  Redo2,
  Shapes,
  SlidersHorizontal,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errText } from "@/components/apps/use-grid";
import { drawSlide, drawTrailerFrame, ensureFonts, ImageCache, renderToCanvas, trailerTimeline } from "@/lib/teaser/render";
import { applyGenerators, brandFrom, buildSlides, newDoc, templateById, type Template } from "@/lib/teaser/templates";
import { uid, type El, type ImageEl, type Slide, type TeaserDoc, type Transition } from "@/lib/teaser/types";
import type { GridSDK } from "@/lib/sdk/types";
import { exportDocx, exportPdf, exportPng, exportPptx, exportVideo, exportWarnings } from "./export";
import { download, safeName } from "./images";
import { BrandPanel, DetailsPanel, ElementsPanel, PhotosPanel, TemplatesPanel } from "./panels";
import { Stage, visualBox } from "./stage";
import { SlideThumb } from "./thumb";
import { Toolbar } from "./toolbar";
import { editEls, useDoc, withDetails } from "./use-doc";
import { fromDesign, stuckTexts, toDesign } from "@/lib/teaser/listing";

type Tab = "templates" | "details" | "brand" | "elements" | "photos";
const TABS: [Tab, string, typeof Presentation][] = [
  ["templates", "Templates", LayoutTemplate],
  ["details", "Details", SlidersHorizontal],
  ["brand", "Brand", Palette],
  ["elements", "Elements", Shapes],
  ["photos", "Photos", ImageLucide],
];

const ROLE_LABEL: Record<string, string> = { cover: "Cover", overview: "Key details", description: "About", highlights: "Highlights", amenities: "Amenities", gallery: "Gallery", location: "Location", pricing: "Price & terms", contact: "Contact", custom: "Scene" };

export interface Project {
  id?: string;
  title: string;
  doc: TeaserDoc;
}

export function Editor({ grid, project, onBack }: { grid: GridSDK; project: Project; onBack: () => void }) {
  const api = useDoc(project.doc);
  const { doc, update } = api;
  const [id, setId] = useState(project.id);
  const [title, setTitle] = useState(project.title);
  const [slideIdxRaw, setSlideIdx] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab | null>(project.doc.property.name ? "elements" : "details");
  const [zoom, setZoom] = useState(1);
  const [saved, setSaved] = useState<"saved" | "saving" | "dirty" | "error">(project.id ? "saved" : "dirty");
  const [aiReady, setAiReady] = useState(false);
  const [busy, setBusy] = useState<{ label: string; p: number; cancel?: () => void } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tick, setTick] = useState(0);
  const images = useMemo(() => new ImageCache(), []);
  const clip = useRef<El[]>([]);
  const firstRender = useRef(true);

  // Undo or delete can shrink the deck under the current index.
  const slideIdx = Math.max(0, Math.min(slideIdxRaw, doc.slides.length - 1));
  const slide = doc.slides[slideIdx]!;
  const selected = slide.elements.filter((e) => sel.includes(e.id));

  useEffect(() => images.onChange(() => setTick((t) => t + 1)), [images]);
  useEffect(() => {
    void ensureFonts(doc).then(() => setTick((t) => t + 1));
  }, [doc.brand.headFont, doc.brand.bodyFont]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    grid.ai
      .providers()
      .then((ps) => setAiReady(ps.some((p) => p.source === "mine" || p.source === "team")))
      .catch(() => {});
  }, [grid]);

  // ---- autosave
  const save = useCallback(async () => {
    setSaved("saving");
    try {
      const c = renderToCanvas(api.docRef.current, api.docRef.current.slides[0]!, images, 360 / api.docRef.current.width);
      const r = await grid.teaser.save({ id, kind: doc.kind, title: title.trim() || "Untitled", templateId: api.docRef.current.templateId, data: api.docRef.current as unknown as Record<string, unknown>, thumb: c.toDataURL("image/jpeg", 0.72) });
      setId(r.id);
      setSaved("saved");
      grid.kv.set("teaser-defaults", { agent: api.docRef.current.agent, logo: api.docRef.current.brand.logo }).catch(() => {});
    } catch (e) {
      setSaved("error");
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  }, [grid, id, doc.kind, title, images, api.docRef]);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      if (project.id) return;
    }
    setSaved("dirty");
    const t = setTimeout(save, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, title]);

  // ---- element operations
  const setEls = useCallback((fn: (els: El[]) => El[], commit = true) => update((d) => editEls(d, slideIdx, fn), commit), [update, slideIdx]);
  const patch = (p: Partial<El> | ((el: El) => Partial<El>), commit = true) => setEls((els) => els.map((e) => (sel.includes(e.id) ? ({ ...e, ...(typeof p === "function" ? p(e) : p) } as El) : e)), commit);
  const add = (el: El) => {
    setEls((els) => [...els, el]);
    setSel([el.id]);
  };
  const remove = () => {
    if (!sel.length) return;
    setEls((els) => els.filter((e) => !sel.includes(e.id)));
    setSel([]);
  };
  const duplicate = () => {
    const copies = selected.map((e) => ({ ...e, id: uid(), x: e.x + 40, y: e.y + 40, auto: undefined, locked: false }));
    if (!copies.length) return;
    setEls((els) => [...els, ...copies]);
    setSel(copies.map((c) => c.id));
  };
  const order = (where: "front" | "forward" | "backward" | "back") =>
    setEls((els) => {
      const ids = new Set(sel);
      const moving = els.filter((e) => ids.has(e.id));
      const rest = els.filter((e) => !ids.has(e.id));
      if (where === "front") return [...rest, ...moving];
      if (where === "back") return [...moving, ...rest];
      const out = [...els];
      const step = where === "forward" ? 1 : -1;
      const idxs = out.map((e, i) => (ids.has(e.id) ? i : -1)).filter((i) => i >= 0);
      for (const i of step > 0 ? idxs.reverse() : idxs) {
        const j = i + step;
        if (j < 0 || j >= out.length || ids.has(out[j]!.id)) continue;
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    });
  const align = (a: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => {
    const boxes = selected.map((e) => visualBox(e, doc));
    const frame =
      selected.length > 1
        ? { x: Math.min(...boxes.map((b) => b.x)), y: Math.min(...boxes.map((b) => b.y)), r: Math.max(...boxes.map((b) => b.x + b.w)), b: Math.max(...boxes.map((b) => b.y + b.h)) }
        : { x: 0, y: 0, r: doc.width, b: doc.height };
    setEls((els) =>
      els.map((e) => {
        const i = selected.findIndex((s) => s.id === e.id);
        if (i < 0) return e;
        const b = boxes[i]!;
        const x = a === "left" ? frame.x : a === "right" ? frame.r - b.w : a === "hcenter" ? (frame.x + frame.r) / 2 - b.w / 2 : e.x;
        const y = a === "top" ? frame.y : a === "bottom" ? frame.b - b.h : a === "vcenter" ? (frame.y + frame.b) / 2 - b.h / 2 : e.y;
        return { ...e, x: Math.round(x), y: Math.round(y) };
      }),
    );
  };

  // Typing a new text in place unbinds; style changes keep the binding.
  const setProp = (p: Partial<TeaserDoc["property"]>, commit = true) => {
    // An untitled project takes the property's name.
    if (p.name !== undefined && /^New (presentation|teaser trailer)$|^$/.test(title.trim()) && p.name.trim()) setTitle(p.name);
    else if (p.name !== undefined && title === doc.property.name) setTitle(p.name);
    update((d) => withDetails(d, p), commit);
  };
  const setAgent = (a: Partial<TeaserDoc["agent"]>) => update((d) => ({ ...d, agent: { ...d.agent, ...a } }), false);
  const setBrand = (b: Partial<TeaserDoc["brand"]>) => update((d) => ({ ...d, brand: { ...d.brand, ...b } }));

  const useImage = (src: string, credit?: string) => {
    const frame = selected.length === 1 && selected[0]!.type === "image" && selected[0]!.bind !== "brand.logo" ? (selected[0] as ImageEl) : null;
    if (frame) {
      setEls((els) => els.map((e) => (e.id === frame.id ? ({ ...e, src, bind: undefined, credit } as El) : e)));
      return;
    }
    const img = images.get(src);
    const ratio = img ? img.naturalHeight / Math.max(1, img.naturalWidth) : 0.66;
    const w = doc.width * 0.4;
    add({ id: uid(), type: "image", x: doc.width / 2 - w / 2, y: doc.height / 2 - (w * ratio) / 2, w, h: w * ratio, src, fit: "cover", credit });
  };

  const switchTemplate = async (t: Template) => {
    if (t.id === doc.templateId) return;
    if (!(await grid.ui.confirm(`Switch to “${t.name}”? Your details, photos and logo stay; edits you made on the slides are replaced.`, { okLabel: "Switch" }))) return;
    update((d) => {
      const next = newDoc(t, { property: d.property, agent: d.agent, brand: brandFrom(t, d.brand.logo) });
      return next;
    });
    setSel([]);
    setSlideIdx(0);
  };

  // ---- saved designs: the look is kept, the property switches
  const [designsTick, setDesignsTick] = useState(0);
  const saveDesign = async () => {
    const stuck = stuckTexts(doc);
    const name = await grid.ui.prompt(
      stuck.length
        ? `Name this design. Note: ${stuck.length} text${stuck.length === 1 ? "" : "s"} you typed by hand mention this property (“${stuck[0]}”). They will not change for other properties; use the Details panel for those instead.`
        : "Name this design. Use it for other properties: the layout, colours, fonts, logo and contact stay; the property details switch.",
      `${t?.name ?? "My"} · ${doc.agent.company || "design"}`,
      { title: "Save as my design" },
    );
    if (!name?.trim()) return;
    try {
      const d = toDesign(doc);
      const c = renderToCanvas(d, d.slides[0]!, images, 360 / d.width);
      await grid.teaser.saveTemplate({ name: name.trim().slice(0, 80), kind: doc.kind, data: d as unknown as Record<string, unknown>, thumb: c.toDataURL("image/jpeg", 0.72) });
      setDesignsTick((x) => x + 1);
      grid.ui.notify(`Saved “${name.trim()}”. Find it under Templates → My designs, or on the Property Teaser home.`, { tone: "ok" });
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };
  const useDesign = async (id: string) => {
    try {
      const r = await grid.teaser.getTemplate(id);
      if (!(await grid.ui.confirm(`Use “${r.name}”? Your property details stay; the slides take that design.`, { okLabel: "Use design" }))) return;
      const design = r.data as unknown as TeaserDoc;
      update((d) => ({ ...fromDesign(design, d.property), agent: d.agent.name ? d.agent : design.agent }));
      setSel([]);
      setSlideIdx(0);
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };

  // ---- slides
  const addSlide = (role: string) => {
    const t = templateById(doc.templateId);
    let s: Slide;
    if (role === "blank" || !t) s = { id: uid("s"), role: "custom", bg: "$paper", duration: doc.kind === "trailer" ? 3 : 5, transition: doc.kind === "trailer" ? "fade" : "none", elements: [] };
    else {
      const built = buildSlides({ ...t, recipe: [role as never] }, doc)[0];
      s = built ?? { id: uid("s"), role: "custom", bg: "$paper", duration: 3, transition: "fade", elements: [] };
    }
    update((d) => ({ ...d, slides: [...d.slides.slice(0, slideIdx + 1), s, ...d.slides.slice(slideIdx + 1)] }));
    setSlideIdx(slideIdx + 1);
    setSel([]);
  };
  const dupSlide = () => {
    const copy: Slide = { ...slide, id: uid("s"), elements: slide.elements.map((e) => ({ ...e, id: uid() })) };
    update((d) => ({ ...d, slides: [...d.slides.slice(0, slideIdx + 1), copy, ...d.slides.slice(slideIdx + 1)] }));
    setSlideIdx(slideIdx + 1);
  };
  const delSlide = () => {
    if (doc.slides.length <= 1) return;
    update((d) => ({ ...d, slides: d.slides.filter((_, i) => i !== slideIdx) }));
    setSel([]);
  };
  const moveSlide = (dir: -1 | 1) => {
    const j = slideIdx + dir;
    if (j < 0 || j >= doc.slides.length) return;
    update((d) => {
      const s = [...d.slides];
      [s[slideIdx], s[j]] = [s[j]!, s[slideIdx]!];
      return { ...d, slides: s };
    });
    setSlideIdx(j);
  };
  const setSlide = (p: Partial<Slide>) => update((d) => ({ ...d, slides: d.slides.map((s, i) => (i === slideIdx ? { ...s, ...p } : s)) }));

  // ---- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement).isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) api.redo();
        else api.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        api.redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      } else if (mod && e.key.toLowerCase() === "c" && selected.length) {
        clip.current = selected.map((x) => ({ ...x }));
      } else if (mod && e.key.toLowerCase() === "v" && clip.current.length) {
        e.preventDefault();
        const copies = clip.current.map((x) => ({ ...x, id: uid(), x: x.x + 30, y: x.y + 30, auto: undefined }));
        setEls((els) => [...els, ...copies]);
        setSel(copies.map((c) => c.id));
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSel(slide.elements.filter((x) => !x.locked).map((x) => x.id));
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel.length) {
        e.preventDefault();
        remove();
      } else if (e.key === "Escape") setSel([]);
      else if (e.key.startsWith("Arrow") && sel.length) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        setEls((els) => els.map((x) => (sel.includes(x.id) && !x.locked ? { ...x, x: x.x + dx, y: x.y + dy } : x)));
      } else if (!sel.length && (e.key === "PageDown" || (e.key === "ArrowRight" && !mod))) setSlideIdx((i) => Math.min(doc.slides.length - 1, i + 1));
      else if (!sel.length && (e.key === "PageUp" || e.key === "ArrowLeft")) setSlideIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- export
  const runExport = async (kind: "pptx" | "pdf" | "docx" | "png" | "video") => {
    setExportOpen(false);
    const w = exportWarnings(doc);
    const issues = [w.frames ? `${w.frames} empty photo frame${w.frames === 1 ? "" : "s"}` : "", w.texts ? `${w.texts} empty detail${w.texts === 1 ? "" : "s"}` : ""].filter(Boolean);
    if (issues.length && !(await grid.ui.confirm(`Your design still has ${issues.join(" and ")}. They will be blank in the export. Export anyway?`, { okLabel: "Export" }))) return;
    const base = safeName(title || doc.property.name);
    const ctrl = new AbortController();
    const prog = (label: string) => (p: number) => setBusy({ label, p, cancel: kind === "video" ? () => ctrl.abort() : undefined });
    try {
      // Saved designs export the same way every time; the export uses the current document.
      const d = applyGenerators(doc);
      if (kind === "pdf") {
        prog("Making the PDF")(0);
        download(await exportPdf(d, images, title, prog("Making the PDF")), `${base}.pdf`);
      } else if (kind === "pptx") {
        prog("Making the PowerPoint")(0);
        download(await exportPptx(d, images, title, prog("Making the PowerPoint")), `${base}.pptx`);
      } else if (kind === "docx") {
        prog("Making the Word file")(0);
        download(await exportDocx(d, images, title, prog("Making the Word file")), `${base}.docx`);
      } else if (kind === "png") {
        prog("Making the image")(0.5);
        download(await exportPng(d, images, slideIdx), `${base}-slide-${slideIdx + 1}.png`);
      } else {
        prog("Rendering the video")(0);
        const v = await exportVideo(d, images, prog("Rendering the video"), ctrl.signal);
        download(v.blob, `${base}.${v.ext}`);
      }
      grid.ui.notify("Downloaded. Find it in your Downloads folder.", { tone: "ok" });
    } catch (e) {
      if ((e as Error).name !== "AbortError") grid.ui.notify(`Export failed: ${errText(e)}`, { tone: "bad" });
    } finally {
      setBusy(null);
    }
  };

  const t = templateById(doc.templateId);
  const { total } = trailerTimeline(doc);
  const roles = t ? [...new Set(t.recipe.map((r) => (r.startsWith("scene-") ? null : r)).filter(Boolean))] : [];

  return (
    <div className="flex h-dvh flex-col bg-sand text-ink" data-testid="teaser-editor">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-white px-2">
        <button type="button" className="btn btn-ghost h-8 min-h-8 px-2 text-xs" onClick={async () => {
          if (saved === "dirty") await save();
          onBack();
        }}>
          <ArrowLeft size={14} /> Projects
        </button>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${doc.kind === "trailer" ? "bg-[#7c3a5b]/10 text-[#7c3a5b]" : "bg-info-soft text-info"}`}>{doc.kind === "trailer" ? `Trailer · ${total.toFixed(0)} s` : "Presentation"}</span>
        <label htmlFor="t-title" className="sr-only">
          Project title
        </label>
        <input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold hover:border-line focus:border-line focus:bg-white focus:outline-none sm:max-w-xs" />
        <span className="hidden text-[11px] text-muted sm:inline" role="status" data-testid="save-state">
          {saved === "saved" ? "Saved" : saved === "saving" ? "Saving…" : saved === "error" ? "Not saved" : "Unsaved changes"}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" className="ga-icon-btn" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!api.canUndo} onClick={api.undo}>
            <Undo2 size={16} />
          </button>
          <button type="button" className="ga-icon-btn" aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)" disabled={!api.canRedo} onClick={api.redo}>
            <Redo2 size={16} />
          </button>
          <span className="mx-1 h-5 w-px bg-line" />
          <button type="button" className="ga-icon-btn" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z - 0.15))}>
            <Minus size={15} />
          </button>
          <button type="button" className="h-8 rounded-lg px-1.5 font-mono text-[11px] hover:bg-sand" onClick={() => setZoom(1)} title="Fit">
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="ga-icon-btn" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.15))}>
            <Plus size={15} />
          </button>
          <span className="mx-1 h-5 w-px bg-line" />
          <button type="button" className="btn btn-ghost h-8 min-h-8 px-2.5 text-xs" onClick={saveDesign} title="Save this look to reuse it for other properties">
            <BookmarkPlus size={14} /> <span className="hidden md:inline">Save design</span>
          </button>
          <button type="button" className="btn btn-ghost h-8 min-h-8 px-2.5 text-xs" onClick={() => setPlaying(true)}>
            <Play size={14} /> Preview
          </button>
          <div className="relative">
            <button type="button" className="btn btn-dark h-8 min-h-8 px-3 text-xs" aria-expanded={exportOpen} onClick={() => setExportOpen(!exportOpen)}>
              <Download size={14} /> Export
            </button>
            {exportOpen && (
              <div className="ga-pop absolute top-10 right-0 z-50 w-72 overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-xl" role="menu" aria-label="Export">
                {(
                  [
                    ["pptx", Presentation, "PowerPoint (.pptx)", doc.kind === "trailer" ? "Plays by itself with timed transitions; text stays editable" : "Editable text and shapes"],
                    ["pdf", FileText, "PDF", "One page per slide, print-ready"],
                    ["docx", FileText, "Word (.docx)", "Property brief with details, highlights and the slides"],
                    ["video", Film, doc.kind === "trailer" ? "Video (MP4)" : "Video slideshow (MP4)", "Animated, made on this computer"],
                    ["png", FileImage, "Image (PNG)", `This slide (${slideIdx + 1})`],
                  ] as const
                ).map(([k, Icon, label, hint]) => (
                  <button key={k} role="menuitem" type="button" onClick={() => runExport(k)} className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-sand">
                    <Icon size={17} className="mt-0.5 shrink-0 text-bronze-ink" />
                    <span>
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-[11px] text-muted">{hint}</span>
                    </span>
                  </button>
                ))}
                <p className="border-t border-line px-2.5 pt-2 pb-1 text-[10px] text-muted">Fonts are built into PDF, Word slides and video. PowerPoint uses them if installed, otherwise a similar font.</p>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Rail + panel */}
        <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-line bg-white py-2" aria-label="Editor panels">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(tab === k ? null : k)} className={`flex w-14 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] transition-colors ${tab === k ? "bg-navy text-cream" : "text-ink-2 hover:bg-sand"}`}>
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        {tab && (
          <aside className="ga-slide-l w-80 shrink-0 overflow-y-auto border-r border-line bg-white" aria-label={TABS.find((x) => x[0] === tab)![1]}>
            {tab === "templates" && <TemplatesPanel grid={grid} doc={doc} images={images} onPick={switchTemplate} onDesign={useDesign} refresh={designsTick} />}
            {tab === "details" && <DetailsPanel grid={grid} doc={doc} setProp={setProp} setAgent={setAgent} aiReady={aiReady} />}
            {tab === "brand" && <BrandPanel grid={grid} doc={doc} setBrand={setBrand} onTemplateColors={() => t && setBrand({ ...brandFrom(t, doc.brand.logo) })} />}
            {tab === "elements" && <ElementsPanel doc={doc} add={add} />}
            {tab === "photos" && <PhotosPanel grid={grid} doc={doc} images={images} canReplace={selected.length === 1 && selected[0]!.type === "image"} onUse={useImage} setPhotos={(photos) => setProp({ photos })} />}
          </aside>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-line bg-white">
            <Toolbar doc={doc} els={selected} patch={patch} onDelete={remove} onDuplicate={duplicate} onOrder={order} onAlign={align} onReplaceImage={() => setTab("photos")} />
          </div>
          <Stage api={api} slideIdx={slideIdx} sel={sel} setSel={setSel} images={images} zoom={zoom} onImageDouble={() => setTab("photos")} tick={tick} />

          {/* Slides */}
          <footer className="shrink-0 border-t border-line bg-white">
            <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs">
              <span className="font-medium">
                Slide {slideIdx + 1} of {doc.slides.length}
              </span>
              {slide.role && <span className="text-muted">· {ROLE_LABEL[slide.role] ?? slide.role}</span>}
              {slide.gen && (
                <label className="ml-2 flex items-center gap-1 text-[11px] text-muted" title="When on, this slide's list updates from Details">
                  <input type="checkbox" checked={!slide.detached} onChange={(e) => update((d) => applyGenerators({ ...d, slides: d.slides.map((s, i) => (i === slideIdx ? { ...s, detached: !e.target.checked } : s)) }))} />
                  Follow Details
                </label>
              )}
              <label className="ml-2 flex items-center gap-1 text-[11px] text-muted">
                Background
                <input type="color" aria-label="Slide background" value={/^#/.test(slide.bg) ? slide.bg.slice(0, 7) : "#ffffff"} onChange={(e) => setSlide({ bg: e.target.value, bgGrad: undefined })} className="h-6 w-8 cursor-pointer rounded border border-line p-0" />
                <select aria-label="Background from brand" className="field h-7 w-28 py-0 text-[11px]" value={slide.bg.startsWith("$") ? slide.bg : ""} onChange={(e) => e.target.value && setSlide({ bg: e.target.value, bgGrad: undefined })}>
                  <option value="">Custom</option>
                  <option value="$paper">Background</option>
                  <option value="$primary">Main colour</option>
                  <option value="$secondary">Soft colour</option>
                  <option value="$accent">Accent</option>
                  <option value="$ink">Text colour</option>
                </select>
              </label>
              {doc.kind === "trailer" && (
                <>
                  <label className="ml-2 flex items-center gap-1 text-[11px] text-muted">
                    Seconds
                    <input type="number" aria-label="Slide duration in seconds" min={1} max={20} step={0.2} value={slide.duration} onChange={(e) => setSlide({ duration: Math.max(1, Math.min(20, Number(e.target.value) || 3)) })} className="field h-7 w-16 py-0 text-xs" />
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-muted">
                    Transition
                    <select aria-label="Transition" value={slide.transition} onChange={(e) => setSlide({ transition: e.target.value as Transition })} className="field h-7 w-24 py-0 text-[11px]">
                      <option value="fade">Fade</option>
                      <option value="slide">Slide</option>
                      <option value="zoom">Zoom</option>
                      <option value="none">Cut</option>
                    </select>
                  </label>
                </>
              )}
              <div className="ml-auto flex items-center gap-0.5">
                <button type="button" className="ga-icon-btn size-7" aria-label="Move slide earlier" onClick={() => moveSlide(-1)} disabled={!slideIdx}>
                  <ChevronLeft size={14} />
                </button>
                <button type="button" className="ga-icon-btn size-7" aria-label="Move slide later" onClick={() => moveSlide(1)} disabled={slideIdx === doc.slides.length - 1}>
                  <ChevronRight size={14} />
                </button>
                <button type="button" className="ga-icon-btn size-7" aria-label="Duplicate slide" onClick={dupSlide}>
                  <Copy size={13} />
                </button>
                <button type="button" className="ga-icon-btn size-7 hover:text-bad" aria-label="Delete slide" onClick={delSlide} disabled={doc.slides.length <= 1}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto px-3 py-2" role="listbox" aria-label="Slides">
              {doc.slides.map((s, i) => (
                <button key={s.id} type="button" role="option" aria-selected={i === slideIdx} onClick={() => {
                  setSlideIdx(i);
                  setSel([]);
                }} className={`group relative shrink-0 overflow-hidden rounded-lg border-2 transition-all ${i === slideIdx ? "border-bronze shadow-md" : "border-transparent hover:border-line-2"}`}>
                  <SlideThumb doc={doc} slide={s} images={images} width={doc.width > doc.height ? 120 : 44} tick={tick} />
                  <span className="absolute bottom-0.5 left-1 rounded bg-black/55 px-1 text-[9px] text-white">
                    {i + 1}
                    {doc.kind === "trailer" ? ` · ${s.duration}s` : ""}
                  </span>
                </button>
              ))}
              <AddSlide roles={roles as string[]} onAdd={addSlide} />
            </div>
          </footer>
        </main>
      </div>

      {busy && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-navy/40 backdrop-blur-sm" role="alertdialog" aria-label={busy.label}>
          <div className="ga-pop w-80 rounded-2xl bg-white p-5 shadow-2xl">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Loader2 size={16} className="animate-spin" /> {busy.label}…
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand">
              <div className="h-full rounded-full bg-gradient-to-r from-bronze to-gold transition-[width]" style={{ width: `${Math.round(busy.p * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">{Math.round(busy.p * 100)}%. Keep this window open.</p>
            {busy.cancel && (
              <button type="button" className="btn btn-ghost mt-3 h-8 min-h-8 w-full text-xs" onClick={busy.cancel}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
      {playing && <Player doc={applyGenerators(doc)} images={images} start={slideIdx} onClose={() => setPlaying(false)} />}
    </div>
  );
}

function AddSlide({ roles, onAdd }: { roles: string[]; onAdd: (role: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button type="button" aria-label="Add slide" aria-expanded={open} onClick={() => setOpen(!open)} className="grid h-[68px] w-16 place-items-center rounded-lg border-2 border-dashed border-line-2 text-muted hover:border-bronze hover:text-bronze-ink">
        <Plus size={18} />
      </button>
      {open && (
        <div className="ga-pop absolute bottom-20 left-0 z-50 w-48 rounded-xl border border-line bg-white p-1.5 shadow-xl" role="menu">
          {["blank", ...roles].map((r) => (
            <button key={r} role="menuitem" type="button" className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-sand" onClick={() => {
              onAdd(r);
              setOpen(false);
            }}>
              {r === "blank" ? "Blank slide" : (ROLE_LABEL[r] ?? r)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Full-window preview: trailers play continuously; decks advance on click or arrow keys, with animations. */
function Player({ doc, images, start, onClose }: { doc: TeaserDoc; images: ImageCache; start: number; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const trailer = doc.kind === "trailer";
  const { items, total } = trailerTimeline(doc);
  const [time, setTime] = useState(trailer ? (items[start]?.start ?? 0) : 0);
  const [idx, setIdx] = useState(start);
  const [paused, setPaused] = useState(false);
  const t0 = useRef(0);
  const timeRef = useRef(time);

  useEffect(() => {
    void images.preload(doc);
    void ensureFonts(doc);
  }, [doc, images]);
  useEffect(() => {
    t0.current = performance.now() - (trailer ? timeRef.current : 0) * 1000;
    let raf = 0;
    const loop = () => {
      const c = ref.current;
      if (c) {
        const ctx = c.getContext("2d")!;
        const now = (performance.now() - t0.current) / 1000;
        ctx.setTransform(c.width / doc.width, 0, 0, c.height / doc.height, 0, 0);
        if (trailer) {
          const tt = paused ? timeRef.current : now % Math.max(0.1, total);
          timeRef.current = tt;
          drawTrailerFrame(ctx, doc, tt, images);
          setTime(tt);
        } else drawSlide(ctx, doc, doc.slides[idx]!, { images, t: paused ? undefined : now });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [doc, images, idx, paused, trailer, total]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (!trailer && (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown")) setIdx((i) => Math.min(doc.slides.length - 1, i + 1));
      else if (!trailer && (e.key === "ArrowLeft" || e.key === "PageUp")) setIdx((i) => Math.max(0, i - 1));
      else if (trailer && e.key === " ") setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trailer, doc.slides.length, onClose]);

  const vert = doc.height > doc.width;
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black/90 p-4" role="dialog" aria-label="Preview" data-testid="player">
      <button type="button" aria-label="Close preview" onClick={onClose} className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
        <X size={18} />
      </button>
      <canvas ref={ref} width={vert ? 540 : 1280} height={vert ? 960 : 720} onClick={() => !trailer && setIdx((i) => (i + 1) % doc.slides.length)} className="max-h-[80vh] max-w-full cursor-pointer rounded-lg shadow-2xl" style={{ aspectRatio: `${doc.width}/${doc.height}` }} />
      <div className="mt-3 flex w-full max-w-3xl items-center gap-3 text-white">
        {trailer ? (
          <>
            <button type="button" aria-label={paused ? "Play" : "Pause"} onClick={() => {
              if (paused) t0.current = performance.now() - timeRef.current * 1000;
              setPaused(!paused);
            }} className="grid size-9 place-items-center rounded-full bg-white/15 hover:bg-white/25">
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
              <div className="h-full bg-gold" style={{ width: `${(time / Math.max(0.1, total)) * 100}%` }} />
            </div>
            <span className="font-mono text-xs">
              {time.toFixed(1)} / {total.toFixed(1)} s
            </span>
          </>
        ) : (
          <>
            <button type="button" aria-label="Previous slide" onClick={() => setIdx(Math.max(0, idx - 1))} className="grid size-9 place-items-center rounded-full bg-white/15 hover:bg-white/25">
              <ChevronLeft size={16} />
            </button>
            <span className="flex-1 text-center text-xs">
              Slide {idx + 1} of {doc.slides.length} · click or → for next · Esc to close
            </span>
            <button type="button" aria-label="Next slide" onClick={() => setIdx(Math.min(doc.slides.length - 1, idx + 1))} className="grid size-9 place-items-center rounded-full bg-white/15 hover:bg-white/25">
              <ChevronRight size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
