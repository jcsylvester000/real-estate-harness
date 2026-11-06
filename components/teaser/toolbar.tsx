"use client";
/** Contextual toolbar for the selected element(s): text, colour, shape, image, icon, arrange and animation controls. */
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  BringToFront,
  CaseUpper,
  Copy,
  ImageIcon,
  Italic,
  Lock,
  SendToBack,
  Trash2,
  Underline,
  Unlock,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { color as resolveColor } from "@/lib/teaser/format";
import type { Anim, El, ImageEl, ShapeEl, TeaserDoc, TextEl } from "@/lib/teaser/types";
import { FONTS } from "./panels";

const TOKENS = ["$primary", "$accent", "$secondary", "$ink", "$paper", "#ffffff", "#000000", "transparent"];
const TOKEN_NAME: Record<string, string> = { $primary: "Main", $accent: "Accent", $secondary: "Soft", $ink: "Text", $paper: "Background", "#ffffff": "White", "#000000": "Black", transparent: "None" };

function Btn({ on, label, onClick, children, disabled }: { on?: boolean; label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={on} disabled={disabled} onClick={onClick} className={`grid size-8 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-30 ${on ? "bg-navy text-cream" : "text-ink-2 hover:bg-sand"}`}>
      {children}
    </button>
  );
}
const Sep = () => <span className="mx-1 h-6 w-px shrink-0 bg-line" aria-hidden />;

export function ColorButton({ value, onChange, label, doc }: { value: string | undefined; onChange: (v: string) => void; label: string; doc: TeaserDoc }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const [base, alpha] = (value ?? "transparent").split("/");
  const resolved = resolveColor(value, doc.brand);
  return (
    <div ref={ref} className="relative">
      <button type="button" title={label} aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-8 place-items-center rounded-lg hover:bg-sand">
        <span className="size-5 rounded-md border border-black/15 bg-[repeating-conic-gradient(#ddd_0_25%,#fff_0_50%)] bg-[length:8px_8px]">
          <span className="block size-full rounded-md" style={{ background: resolved }} />
        </span>
      </button>
      {open && (
        <div className="ga-pop absolute top-10 left-0 z-50 w-56 rounded-xl border border-line bg-white p-3 shadow-xl" role="dialog" aria-label={label}>
          <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted uppercase">Brand</p>
          <div className="grid grid-cols-8 gap-1">
            {TOKENS.map((t) => (
              <button key={t} type="button" title={TOKEN_NAME[t]} aria-label={TOKEN_NAME[t]} onClick={() => onChange(alpha && t.startsWith("$") ? `${t}/${alpha}` : t)} className={`size-6 rounded-md border ${base === t ? "ring-2 ring-[#2f80ed]" : "border-black/15"} bg-[repeating-conic-gradient(#ddd_0_25%,#fff_0_50%)] bg-[length:8px_8px]`}>
                <span className="block size-full rounded-md" style={{ background: resolveColor(t, doc.brand) }} />
              </button>
            ))}
          </div>
          {base?.startsWith("$") && (
            <>
              <p className="mt-2.5 mb-1 text-[10px] font-semibold tracking-wider text-muted uppercase">Strength</p>
              <div className="flex gap-1">
                {["100", "80", "60", "40", "20", "10"].map((a) => (
                  <button key={a} type="button" onClick={() => onChange(a === "100" ? base : `${base}/${a}`)} className={`flex-1 rounded-md border py-0.5 text-[10px] ${(alpha ?? "100") === a ? "border-navy bg-navy text-cream" : "border-line"}`}>
                    {a}%
                  </button>
                ))}
              </div>
            </>
          )}
          <label className="mt-2.5 flex items-center gap-2 text-xs">
            <input type="color" value={resolved.startsWith("#") ? resolved.slice(0, 7) : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-line p-0.5" />
            Custom colour
          </label>
        </div>
      )}
    </div>
  );
}

function Num({ label, value, onChange, min = 0, max = 999, step = 1, w = "w-14" }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; w?: string }) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-muted" title={label}>
      <span className="sr-only">{label}</span>
      <input type="number" aria-label={label} className={`field h-8 ${w} px-1.5 py-0 text-xs text-ink`} value={Math.round(value * 100) / 100} min={min} max={max} step={step} onChange={(e) => e.target.value !== "" && onChange(Math.max(min, Math.min(max, Number(e.target.value))))} />
    </label>
  );
}

const ANIMS: [Anim, string][] = [
  ["none", "No animation"],
  ["fade", "Fade in"],
  ["rise", "Rise"],
  ["drop", "Drop in"],
  ["slideL", "Slide from left"],
  ["slideR", "Slide from right"],
  ["zoom", "Zoom in"],
  ["pop", "Pop"],
  ["wipe", "Wipe"],
];

export function Toolbar({
  doc,
  els,
  patch,
  onDelete,
  onDuplicate,
  onOrder,
  onAlign,
  onReplaceImage,
}: {
  doc: TeaserDoc;
  els: El[];
  patch: (p: Partial<El> | ((el: El) => Partial<El>), commit?: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onOrder: (where: "front" | "forward" | "backward" | "back") => void;
  onAlign: (a: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => void;
  onReplaceImage: () => void;
}) {
  if (!els.length) return <div className="flex h-12 items-center px-3 text-xs text-muted" data-testid="toolbar">Select something on the slide to edit it. Double-click text to type; drag corners to resize.</div>;
  const el = els[0]!;
  const one = els.length === 1;
  const t = one && el.type === "text" ? (el as TextEl) : null;
  const sh = one && el.type === "shape" ? (el as ShapeEl) : null;
  const im = one && el.type === "image" ? (el as ImageEl) : null;
  const ic = one && el.type === "icon" ? el : null;
  const locked = els.every((e) => e.locked);

  return (
    <div className="flex h-12 items-center gap-0.5 overflow-x-auto px-2" role="toolbar" aria-label="Element tools" data-testid="toolbar">
      {t && (
        <>
          <select aria-label="Font" className="field h-8 w-40 py-0 text-xs" value={t.font} onChange={(e) => patch({ font: e.target.value })}>
            <option value="$head">Heading font ({doc.brand.headFont})</option>
            <option value="$body">Body font ({doc.brand.bodyFont})</option>
            {FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <Num label="Font size" value={t.size} onChange={(v) => patch({ size: v })} min={6} max={600} />
          <ColorButton label="Text colour" value={t.color} onChange={(v) => patch({ color: v })} doc={doc} />
          <Btn label="Bold" on={t.weight === 700} onClick={() => patch({ weight: t.weight === 700 ? 400 : 700 })}>
            <Bold size={15} />
          </Btn>
          <Btn label="Italic" on={!!t.italic} onClick={() => patch({ italic: !t.italic })}>
            <Italic size={15} />
          </Btn>
          <Btn label="Underline" on={!!t.underline} onClick={() => patch({ underline: !t.underline })}>
            <Underline size={15} />
          </Btn>
          <Btn label="Uppercase" on={!!t.upper} onClick={() => patch({ upper: !t.upper })}>
            <CaseUpper size={16} />
          </Btn>
          <Btn label="Align left" on={t.align === "left"} onClick={() => patch({ align: "left" })}>
            <AlignLeft size={15} />
          </Btn>
          <Btn label="Align centre" on={t.align === "center"} onClick={() => patch({ align: "center" })}>
            <AlignCenter size={15} />
          </Btn>
          <Btn label="Align right" on={t.align === "right"} onClick={() => patch({ align: "right" })}>
            <AlignRight size={15} />
          </Btn>
          <Num label="Line height" value={t.lineHeight} onChange={(v) => patch({ lineHeight: v })} min={0.6} max={3} step={0.05} />
          <Num label="Letter spacing" value={t.spacing ?? 0} onChange={(v) => patch({ spacing: v })} min={-10} max={40} />
          <Btn label="Text shadow" on={!!t.shadow} onClick={() => patch({ shadow: !t.shadow })}>
            <span className="text-sm font-bold [text-shadow:1px_1px_2px_rgb(0_0_0/0.6)]">S</span>
          </Btn>
          <ColorButton label="Text background" value={t.bg ?? "transparent"} onChange={(v) => patch({ bg: v === "transparent" ? undefined : v, pad: t.pad ?? 18, radius: t.radius ?? 12 })} doc={doc} />
          {t.bind && <span className="ml-1 shrink-0 rounded-full bg-info-soft px-2 py-0.5 text-[10px] text-info" title="This text follows your Details. Typing over it makes it your own.">Live: {t.bind.replace(/^(property|agent)\./, "")}</span>}
          <Sep />
        </>
      )}
      {sh && (
        <>
          <ColorButton label="Fill" value={sh.fill} onChange={(v) => patch({ fill: v, grad: undefined })} doc={doc} />
          <ColorButton label="Outline colour" value={sh.stroke ?? "transparent"} onChange={(v) => patch({ stroke: v, strokeW: sh.strokeW || 4 })} doc={doc} />
          <Num label="Outline width" value={sh.strokeW ?? 0} onChange={(v) => patch({ strokeW: v })} max={60} />
          {sh.shape === "rect" && <Num label="Corner radius" value={sh.radius ?? 0} onChange={(v) => patch({ radius: v })} max={1000} />}
          <Sep />
        </>
      )}
      {im && (
        <>
          <button type="button" className="btn btn-ghost h-8 min-h-8 px-2.5 text-xs" onClick={onReplaceImage}>
            <ImageIcon size={14} /> {im.src || im.bind ? "Replace" : "Add photo"}
          </button>
          <select aria-label="Fit" className="field h-8 w-24 py-0 text-xs" value={im.fit} onChange={(e) => patch({ fit: e.target.value as "cover" | "contain" })}>
            <option value="cover">Fill</option>
            <option value="contain">Fit</option>
          </select>
          <Num label="Corner radius" value={im.radius ?? 0} onChange={(v) => patch({ radius: v })} max={2000} />
          <ColorButton label="Colour wash" value={im.overlay ?? "transparent"} onChange={(v) => patch({ overlay: v === "transparent" ? undefined : v })} doc={doc} />
          {doc.kind === "trailer" && (
            <Btn label="Slow zoom (Ken Burns)" on={!!im.kenburns} onClick={() => patch({ kenburns: !im.kenburns })}>
              <span className="text-[10px] font-bold">KB</span>
            </Btn>
          )}
          {im.fit === "cover" && (
            <label className="flex items-center gap-1 text-[10px] text-muted">
              Focus
              <input type="range" aria-label="Focus left to right" min={0} max={1} step={0.05} value={im.fx ?? 0.5} onChange={(e) => patch({ fx: Number(e.target.value) }, false)} className="w-16" />
              <input type="range" aria-label="Focus top to bottom" min={0} max={1} step={0.05} value={im.fy ?? 0.5} onChange={(e) => patch({ fy: Number(e.target.value) }, false)} className="w-16" />
            </label>
          )}
          {im.bind?.startsWith("photo:") && <span className="ml-1 shrink-0 rounded-full bg-info-soft px-2 py-0.5 text-[10px] text-info">Property photo {Number(im.bind.slice(6)) + 1}</span>}
          <Sep />
        </>
      )}
      {ic && (
        <>
          <ColorButton label="Icon colour" value={ic.color} onChange={(v) => patch({ color: v })} doc={doc} />
          <ColorButton label="Icon background" value={ic.bg ?? "transparent"} onChange={(v) => patch({ bg: v === "transparent" ? undefined : v })} doc={doc} />
          <Num label="Line width" value={ic.strokeW ?? 2} onChange={(v) => patch({ strokeW: v })} min={0.5} max={4} step={0.25} />
          <Sep />
        </>
      )}
      <label className="flex items-center gap-1 text-[10px] text-muted" title="Transparency">
        Opacity
        <input type="range" aria-label="Opacity" min={0.05} max={1} step={0.05} value={el.opacity ?? 1} onChange={(e) => patch({ opacity: Number(e.target.value) }, false)} className="w-16" />
      </label>
      <Sep />
      <Btn label="Align left" onClick={() => onAlign("left")}>
        <AlignStartVertical size={15} />
      </Btn>
      <Btn label="Centre horizontally" onClick={() => onAlign("hcenter")}>
        <AlignCenterVertical size={15} />
      </Btn>
      <Btn label="Align right" onClick={() => onAlign("right")}>
        <AlignEndVertical size={15} />
      </Btn>
      <Btn label="Align top" onClick={() => onAlign("top")}>
        <AlignStartHorizontal size={15} />
      </Btn>
      <Btn label="Centre vertically" onClick={() => onAlign("vcenter")}>
        <AlignCenterHorizontal size={15} />
      </Btn>
      <Btn label="Align bottom" onClick={() => onAlign("bottom")}>
        <AlignEndHorizontal size={15} />
      </Btn>
      <Sep />
      <Btn label="Bring to front" onClick={() => onOrder("front")}>
        <BringToFront size={15} />
      </Btn>
      <Btn label="Forward" onClick={() => onOrder("forward")}>
        <ArrowUpToLine size={15} />
      </Btn>
      <Btn label="Backward" onClick={() => onOrder("backward")}>
        <ArrowDownToLine size={15} />
      </Btn>
      <Btn label="Send to back" onClick={() => onOrder("back")}>
        <SendToBack size={15} />
      </Btn>
      <Sep />
      <>
          <select aria-label="Animation" title="Animation (plays in trailers, previews and video)" className="field h-8 w-32 py-0 text-xs" value={el.anim?.type ?? "none"} onChange={(e) => patch({ anim: e.target.value === "none" ? undefined : { type: e.target.value as Anim, delay: el.anim?.delay ?? 0.2, dur: el.anim?.dur ?? 0.7 } })}>
            {ANIMS.map(([a, l]) => (
              <option key={a} value={a}>
                {l}
              </option>
            ))}
          </select>
          {el.anim && <Num label="Animation delay (seconds)" value={el.anim.delay ?? 0} onChange={(v) => patch({ anim: { ...el.anim!, delay: v } })} max={20} step={0.1} />}
          <Sep />
      </>
      <Btn label={locked ? "Unlock" : "Lock"} on={locked} onClick={() => patch({ locked: !locked })}>
        {locked ? <Lock size={15} /> : <Unlock size={15} />}
      </Btn>
      <Btn label="Duplicate (Ctrl+D)" onClick={onDuplicate}>
        <Copy size={15} />
      </Btn>
      <Btn label="Delete (Del)" onClick={onDelete}>
        <Trash2 size={15} />
      </Btn>
      {one && <span className="ml-2 shrink-0 font-mono text-[10px] text-muted">{Math.round(el.x)}, {Math.round(el.y)} · {Math.round(el.w)}×{Math.round(el.h)}{el.rot ? ` · ${el.rot}°` : ""}</span>}
    </div>
  );
}
