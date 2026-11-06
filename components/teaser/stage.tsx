"use client";
/**
 * The design canvas: draws the slide with the shared renderer and handles selection, moving (with snapping
 * guides), resizing, rotating, marquee select and in-place text editing.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { color, font, liveEl } from "@/lib/teaser/format";
import { drawSlide, layoutText, type ImageCache } from "@/lib/teaser/render";
import type { El, TeaserDoc, TextEl } from "@/lib/teaser/types";
import { editEls, type DocApi } from "./use-doc";

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rot";
type Drag =
  | { mode: "move"; sx: number; sy: number; start: Map<string, { x: number; y: number }>; moved: boolean }
  | { mode: "resize"; handle: Handle; sx: number; sy: number; el: El }
  | { mode: "rotate"; cx: number; cy: number; el: El }
  | { mode: "marquee"; sx: number; sy: number; x: number; y: number; add: boolean };

const SNAP = 8;
const measureCtx = () => document.createElement("canvas").getContext("2d")!;

/** Box an element really occupies (text grows with its content). */
export function visualBox(el: El, doc: TeaserDoc, ctx?: CanvasRenderingContext2D) {
  if (el.type !== "text") return { x: el.x, y: el.y, w: el.w, h: el.h };
  const live = liveEl(el, doc) as TextEl;
  const { height } = layoutText(ctx ?? measureCtx(), live, doc.brand);
  return { x: el.x, y: el.y, w: el.w, h: Math.max(20, height + (el.bg ? (el.pad ?? 16) * 2 : 0)) };
}

function toLocal(px: number, py: number, el: { x: number; y: number; w: number; h: number; rot?: number }) {
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  const r = (-(el.rot ?? 0) * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
}

export function Stage({
  api,
  slideIdx,
  sel,
  setSel,
  images,
  zoom,
  onImageDouble,
  tick,
}: {
  api: DocApi;
  slideIdx: number;
  sel: string[];
  setSel: (ids: string[]) => void;
  images: ImageCache;
  zoom: number;
  onImageDouble: (id: string) => void;
  tick: number;
}) {
  const { doc } = api;
  const slide = doc.slides[slideIdx];
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 800, h: 500 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [editing, setEditing] = useState<string | null>(null);
  const mctx = useMemo(() => (typeof document === "undefined" ? null : measureCtx()), []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = Math.min((box.w - 56) / doc.width, (box.h - 56) / doc.height);
  const scale = Math.max(0.05, fit * zoom);
  const vw = doc.width * scale;
  const vh = doc.height * scale;

  // Draw.
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c || !slide) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(vw * dpr);
    c.height = Math.round(vh * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    drawSlide(ctx, doc, slide, { images, placeholders: true, hide: editing ? new Set([editing]) : undefined });
  }, [doc, slide, vw, vh, scale, images, editing, tick]);

  const els = useMemo(() => slide?.elements ?? [], [slide]);
  const pt = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  /** Topmost element under a point; locked elements only when nothing else is there. Outline-only shapes count at their edge. */
  const hit = (x: number, y: number) => {
    const inside = (el: El) => {
      const b = visualBox(el, doc, mctx ?? undefined);
      const l = toLocal(x, y, { ...b, rot: el.rot });
      const inBox = l.x >= b.x && l.x <= b.x + b.w && l.y >= b.y && l.y <= b.y + b.h;
      if (!inBox) return false;
      if (el.type === "shape" && (el.fill === "transparent" || !el.fill) && !el.grad) {
        const m = 14 / scale;
        return l.x - b.x < m || b.x + b.w - l.x < m || l.y - b.y < m || b.y + b.h - l.y < m;
      }
      return true;
    };
    for (const pass of [false, true])
      for (let i = els.length - 1; i >= 0; i--) {
        const el = els[i]!;
        if (!!el.locked !== pass) continue;
        if (inside(el)) return el;
      }
    return undefined;
  };

  const setEls = (fn: (els: El[]) => El[], commit = false) => api.update((d) => editEls(d, slideIdx, fn), commit);

  // Snap a moving box to the slide and other elements; returns the adjustment and guide lines.
  const snap = useCallback(
    (b: { x: number; y: number; w: number; h: number }, ignore: Set<string>) => {
      const vs = [0, doc.width / 2, doc.width];
      const hs = [0, doc.height / 2, doc.height];
      for (const e of els) {
        if (ignore.has(e.id)) continue;
        const o = visualBox(e, doc, mctx ?? undefined);
        vs.push(o.x, o.x + o.w / 2, o.x + o.w);
        hs.push(o.y, o.y + o.h / 2, o.y + o.h);
      }
      const tol = SNAP / scale;
      let dx = 0;
      let dy = 0;
      const gv: number[] = [];
      const gh: number[] = [];
      let best = tol;
      for (const cand of [b.x, b.x + b.w / 2, b.x + b.w])
        for (const v of vs)
          if (Math.abs(v - cand) < best) {
            best = Math.abs(v - cand);
            dx = v - cand;
            gv[0] = v;
          }
      best = tol;
      for (const cand of [b.y, b.y + b.h / 2, b.y + b.h])
        for (const h of hs)
          if (Math.abs(h - cand) < best) {
            best = Math.abs(h - cand);
            dy = h - cand;
            gh[0] = h;
          }
      return { dx, dy, gv, gh };
    },
    [els, doc, scale, mctx],
  );

  const onDown = (e: React.PointerEvent) => {
    if (editing) return;
    const p = pt(e);
    const h = (e.target as HTMLElement).dataset.handle as Handle | undefined;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (h && sel.length === 1) {
      const el = els.find((x) => x.id === sel[0])!;
      if (h === "rot") setDrag({ mode: "rotate", cx: el.x + el.w / 2, cy: el.y + el.h / 2, el });
      else setDrag({ mode: "resize", handle: h, sx: p.x, sy: p.y, el: { ...el, h: visualBox(el, doc, mctx ?? undefined).h } });
      return;
    }
    const target = hit(p.x, p.y);
    if (!target) {
      if (!e.shiftKey) setSel([]);
      setDrag({ mode: "marquee", sx: p.x, sy: p.y, x: p.x, y: p.y, add: e.shiftKey });
      return;
    }
    let ids = sel;
    if (e.shiftKey) ids = sel.includes(target.id) ? sel.filter((x) => x !== target.id) : [...sel, target.id];
    else if (!sel.includes(target.id)) ids = [target.id];
    setSel(ids);
    const start = new Map(els.filter((x) => ids.includes(x.id) && !x.locked).map((x) => [x.id, { x: x.x, y: x.y }]));
    setDrag({ mode: "move", sx: p.x, sy: p.y, start, moved: false });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = pt(e);
    if (drag.mode === "marquee") {
      setDrag({ ...drag, x: p.x, y: p.y });
      return;
    }
    if (drag.mode === "move") {
      let dx = p.x - drag.sx;
      let dy = p.y - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) * scale < 3) return;
      if (!drag.start.size) return;
      // Bounding box of the moving selection, snapped.
      const moving = els.filter((x) => drag.start.has(x.id));
      const bs = moving.map((x) => visualBox(x, doc, mctx ?? undefined));
      const minX = Math.min(...moving.map((x) => drag.start.get(x.id)!.x));
      const minY = Math.min(...moving.map((x) => drag.start.get(x.id)!.y));
      const maxX = Math.max(...moving.map((x, i) => drag.start.get(x.id)!.x + bs[i]!.w));
      const maxY = Math.max(...moving.map((x, i) => drag.start.get(x.id)!.y + bs[i]!.h));
      if (!e.altKey) {
        const s = snap({ x: minX + dx, y: minY + dy, w: maxX - minX, h: maxY - minY }, new Set(drag.start.keys()));
        dx += s.dx;
        dy += s.dy;
        setGuides({ v: s.gv.filter((v) => v !== undefined), h: s.gh.filter((v) => v !== undefined) });
      }
      if (!drag.moved) setDrag({ ...drag, moved: true });
      setEls((all) => all.map((x) => (drag.start.has(x.id) ? { ...x, x: Math.round(drag.start.get(x.id)!.x + dx), y: Math.round(drag.start.get(x.id)!.y + dy) } : x)));
      return;
    }
    if (drag.mode === "rotate") {
      let ang = (Math.atan2(p.y - drag.cy, p.x - drag.cx) * 180) / Math.PI + 90;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      else if (Math.abs(((ang % 90) + 90) % 90) < 3 || Math.abs(((ang % 90) + 90) % 90) > 87) ang = Math.round(ang / 90) * 90;
      ang = ((ang % 360) + 360) % 360;
      setEls((all) => all.map((x) => (x.id === drag.el.id ? { ...x, rot: Math.round(ang) } : x)));
      return;
    }
    // resize in the element's own axes
    const el = drag.el;
    const r = ((el.rot ?? 0) * Math.PI) / 180;
    const rx = p.x - drag.sx;
    const ry = p.y - drag.sy;
    const dx = rx * Math.cos(r) + ry * Math.sin(r);
    const dy = -rx * Math.sin(r) + ry * Math.cos(r);
    const hnd = drag.handle;
    let { x, y, w, h } = el;
    const keep = el.type === "image" || el.type === "icon" || (el.type === "text" && hnd.length === 2) || e.shiftKey;
    if (hnd.includes("e")) w = Math.max(10, el.w + dx);
    if (hnd.includes("w")) {
      w = Math.max(10, el.w - dx);
      x = el.x + (el.w - w);
    }
    if (hnd.includes("s")) h = Math.max(10, el.h + dy);
    if (hnd.includes("n")) {
      h = Math.max(10, el.h - dy);
      y = el.y + (el.h - h);
    }
    if (keep && hnd.length === 2) {
      const k = Math.max(w / el.w, h / el.h);
      w = el.w * k;
      h = el.h * k;
      if (hnd.includes("w")) x = el.x + el.w - w;
      if (hnd.includes("n")) y = el.y + el.h - h;
    }
    setEls((all) =>
      all.map((o) => {
        if (o.id !== el.id) return o;
        if (o.type === "text" && hnd.length === 2) {
          const k = w / el.w;
          return { ...o, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), size: Math.max(6, Math.round(((el as TextEl).size * k) * 10) / 10) };
        }
        if (o.type === "text") return { ...o, x: Math.round(x), w: Math.round(w), ...(hnd === "n" || hnd === "s" ? { y: Math.round(y), h: Math.round(h) } : {}) };
        return { ...o, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
      }),
    );
  };

  const onUp = () => {
    if (drag?.mode === "marquee") {
      const x0 = Math.min(drag.sx, drag.x);
      const y0 = Math.min(drag.sy, drag.y);
      const x1 = Math.max(drag.sx, drag.x);
      const y1 = Math.max(drag.sy, drag.y);
      if (x1 - x0 > 4 || y1 - y0 > 4) {
        const inside = els.filter((el) => !el.locked && el.x < x1 && el.x + el.w > x0 && el.y < y1 && el.y + el.h > y0).map((el) => el.id);
        setSel(drag.add ? [...new Set([...sel, ...inside])] : inside);
      }
    } else if (drag) api.commit();
    setDrag(null);
    setGuides({ v: [], h: [] });
  };

  const onDouble = (e: React.MouseEvent) => {
    const p = pt(e);
    const t = hit(p.x, p.y);
    if (!t) return;
    if (t.type === "text") {
      setSel([t.id]);
      setEditing(t.id);
    } else if (t.type === "image") onImageDouble(t.id);
  };

  const selected = els.filter((x) => sel.includes(x.id));
  const one = selected.length === 1 ? selected[0]! : null;
  const editEl = editing ? (els.find((x) => x.id === editing) as TextEl | undefined) : undefined;

  return (
    <div ref={wrap} className="ga-stage relative min-h-0 flex-1 overflow-auto" data-testid="stage">
      <div className="flex min-h-full min-w-full items-center justify-center p-7">
        <div
          className="relative shrink-0 shadow-[0_30px_70px_-30px_rgb(14_25_47/0.55)] ring-1 ring-black/10"
          style={{ width: vw, height: vh }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onDoubleClick={onDouble}
        >
          <canvas ref={canvas} style={{ width: vw, height: vh, display: "block" }} aria-label={`Slide ${slideIdx + 1} of ${doc.slides.length}`} role="img" />
          {/* selection */}
          {selected.map((el) => {
            const b = visualBox(el, doc, mctx ?? undefined);
            return (
              <div
                key={el.id}
                className={`pointer-events-none absolute border-2 ${el.locked ? "border-dashed border-muted" : "border-[#2f80ed]"}`}
                style={{ left: b.x * scale - 1, top: b.y * scale - 1, width: b.w * scale + 2, height: b.h * scale + 2, transform: `rotate(${el.rot ?? 0}deg)` }}
                data-selected={el.id}
              >
                {one && !el.locked && !editing && (
                  <>
                    {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as Handle[])
                      .filter((h) => !(el.type === "text" && (h === "n" || h === "s")))
                      .map((h) => (
                        <span
                          key={h}
                          data-handle={h}
                          className="pointer-events-auto absolute size-3 rounded-full border-2 border-[#2f80ed] bg-white shadow"
                          style={{
                            left: h.includes("w") ? -7 : h.includes("e") ? "calc(100% - 5px)" : "calc(50% - 6px)",
                            top: h.includes("n") ? -7 : h.includes("s") ? "calc(100% - 5px)" : "calc(50% - 6px)",
                            cursor: `${h}-resize`,
                          }}
                        />
                      ))}
                    <span data-handle="rot" title="Rotate (Shift: 15° steps)" className="pointer-events-auto absolute left-[calc(50%-8px)] -top-9 grid size-4 cursor-grab place-items-center rounded-full border-2 border-[#2f80ed] bg-white shadow" />
                  </>
                )}
              </div>
            );
          })}
          {drag?.mode === "marquee" && (
            <div className="pointer-events-none absolute border border-[#2f80ed] bg-[#2f80ed]/10" style={{ left: Math.min(drag.sx, drag.x) * scale, top: Math.min(drag.sy, drag.y) * scale, width: Math.abs(drag.x - drag.sx) * scale, height: Math.abs(drag.y - drag.sy) * scale }} />
          )}
          {guides.v.map((v, i) => (
            <div key={`v${i}`} className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#ff2d87]" style={{ left: v * scale }} />
          ))}
          {guides.h.map((h, i) => (
            <div key={`h${i}`} className="pointer-events-none absolute right-0 left-0 h-px bg-[#ff2d87]" style={{ top: h * scale }} />
          ))}
          {editEl && (
            <TextEditor
              el={liveEl(editEl, doc, false) as TextEl}
              doc={doc}
              scale={scale}
              onChange={(text) =>
                setEls((all) =>
                  all.map((x) => {
                    if (x.id !== editEl.id || x.type !== "text") return x;
                    const live = liveEl(x, doc, false) as TextEl;
                    // Typing over a bound field unbinds it (the text is now yours), except when it still matches.
                    return x.bind && text !== live.text ? { ...x, text, bind: undefined } : { ...x, text };
                  }),
                )
              }
              onDone={() => {
                setEditing(null);
                api.commit();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TextEditor({ el, doc, scale, onChange, onDone }: { el: TextEl; doc: TeaserDoc; scale: number; onChange: (t: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.focus();
    t.select();
  }, []);
  const pad = el.bg ? (el.pad ?? 16) : 0;
  return (
    <textarea
      ref={ref}
      aria-label="Edit text"
      defaultValue={el.text}
      onInput={(e) => {
        const t = e.currentTarget;
        t.style.height = "auto";
        t.style.height = `${t.scrollHeight}px`;
        onChange(t.value);
      }}
      onBlur={onDone}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) onDone();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute resize-none overflow-hidden border-0 bg-white/10 p-0 outline-2 outline-[#2f80ed] outline-dashed"
      style={{
        left: el.x * scale,
        top: el.y * scale,
        width: el.w * scale,
        minHeight: el.size * el.lineHeight * scale,
        padding: pad * scale,
        transform: `rotate(${el.rot ?? 0}deg)`,
        transformOrigin: "center",
        font: `${el.italic ? "italic " : ""}${el.weight} ${el.size * scale}px/${el.lineHeight} "${font(el.font, doc.brand)}"`,
        letterSpacing: `${(el.spacing ?? 0) * scale}px`,
        textTransform: el.upper ? "uppercase" : "none",
        textAlign: el.align,
        color: color(el.color, doc.brand),
        caretColor: "#2f80ed",
      }}
    />
  );
}
