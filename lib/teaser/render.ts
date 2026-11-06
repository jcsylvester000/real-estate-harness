/**
 * Canvas renderer for Property Teaser. The editor, thumbnails, PDF pages, PNG slides and video frames all
 * draw through drawSlide(), so what you see is what you export. Browser only.
 */
import { color, font, liveEl } from "./format";
import { iconDataUrl } from "./icons";
import type { Anim, Brand, El, ImageEl, ShapeEl, Slide, TeaserDoc, TextEl } from "./types";

/** asset:<id> → served URL; data: and same-origin paths pass through. */
export const srcUrl = (src: string) => (src.startsWith("asset:") ? `/api/teaser-assets/${src.slice(6)}` : src);
const iconKey = (name: string, c: string, sw: number) => `icon:${name}|${c}|${sw}`;

/** Loads images once and tells listeners when something new is ready (the editor then redraws). */
export class ImageCache {
  private map = new Map<string, HTMLImageElement | "loading" | "error">();
  private listeners = new Set<() => void>();
  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  get(key: string): HTMLImageElement | undefined {
    const v = this.map.get(key);
    if (v instanceof HTMLImageElement) return v;
    if (v === undefined) void this.load(key);
    return undefined;
  }
  isError(key: string) {
    return this.map.get(key) === "error";
  }
  load(key: string): Promise<void> {
    const v = this.map.get(key);
    if (v instanceof HTMLImageElement || v === "error") return Promise.resolve();
    if (v === "loading") return new Promise((r) => this.onChange(() => (this.map.get(key) !== "loading" ? r() : undefined)));
    this.map.set(key, "loading");
    const url = key.startsWith("icon:") ? (() => {
      const [name, c, sw] = key.slice(5).split("|") as [string, string, string];
      return iconDataUrl(name, c, 192, Number(sw));
    })() : srcUrl(key);
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        this.map.set(key, img);
        this.listeners.forEach((l) => l());
        resolve();
      };
      img.onerror = () => {
        this.map.set(key, "error");
        this.listeners.forEach((l) => l());
        resolve();
      };
      img.src = url;
    });
  }
  /** Everything a set of slides needs, loaded (for exports). */
  async preload(doc: TeaserDoc, slides: Slide[] = doc.slides) {
    const keys = new Set<string>();
    for (const s of slides)
      for (const raw of s.elements) {
        const el = liveEl(raw, doc, false);
        if (el.type === "image" && el.src) keys.add(el.src);
        if (el.type === "icon") keys.add(iconKey(el.icon, color(el.color, doc.brand), el.strokeW ?? 2));
      }
    await Promise.all([...keys].map((k) => this.load(k)));
  }
}

/** Waits for the design fonts a document uses (canvas draws with whatever is loaded). */
export async function ensureFonts(doc: TeaserDoc) {
  if (typeof document === "undefined" || !document.fonts) return;
  const fams = new Set<string>([doc.brand.headFont, doc.brand.bodyFont]);
  for (const s of doc.slides) for (const e of s.elements) if (e.type === "text") fams.add(font(e.font, doc.brand));
  await Promise.all([...fams].flatMap((f) => [`400 40px "${f}"`, `700 40px "${f}"`, `italic 400 40px "${f}"`].map((spec) => document.fonts.load(spec).catch(() => []))));
}

// ---- easing and animation

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

interface AnimState {
  alpha: number;
  dx: number;
  dy: number;
  scale: number;
  clip: number;
}
function animAt(type: Anim, p: number): AnimState {
  const e = easeOut(p);
  const s: AnimState = { alpha: clamp(p * 2.2), dx: 0, dy: 0, scale: 1, clip: 1 };
  switch (type) {
    case "fade":
      s.alpha = e;
      break;
    case "rise":
      s.dy = (1 - e) * 60;
      break;
    case "drop":
      s.dy = -(1 - e) * 60;
      break;
    case "slideL":
      s.dx = -(1 - e) * 160;
      break;
    case "slideR":
      s.dx = (1 - e) * 160;
      break;
    case "zoom":
      s.scale = 0.86 + 0.14 * e;
      break;
    case "pop":
      s.scale = 0.55 + 0.45 * easeOutBack(p);
      s.alpha = clamp(p * 3);
      break;
    case "wipe":
      s.clip = e;
      s.alpha = 1;
      break;
    default:
      s.alpha = 1;
  }
  return s;
}

// ---- text layout

export const fontSpec = (el: TextEl, brand: Brand, scale = 1) => `${el.italic ? "italic " : ""}${el.weight} ${el.size * scale}px "${font(el.font, brand)}"`;

export function layoutText(ctx: CanvasRenderingContext2D, el: TextEl, brand: Brand) {
  ctx.font = fontSpec(el, brand);
  setSpacing(ctx, el.spacing ?? 0);
  const text = el.upper ? el.text.toUpperCase() : el.text;
  const maxW = Math.max(10, el.w - (el.bg ? (el.pad ?? 16) * 2 : 0));
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = "";
    for (const w of words) {
      const test = line + w;
      if (ctx.measureText(test.trimEnd()).width > maxW && line.trim()) {
        lines.push(line.trimEnd());
        line = w.trimStart();
        // A single word longer than the box: break it.
        while (ctx.measureText(line).width > maxW && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxW) cut--;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else line = test;
    }
    lines.push(line.trimEnd());
  }
  const lineH = el.size * el.lineHeight;
  return { lines, lineH, height: lines.length * lineH - (lineH - el.size) * 0.3 };
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${px}px`;
}

// ---- shapes

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function shapePath(ctx: CanvasRenderingContext2D, el: Pick<ShapeEl, "shape" | "w" | "h" | "radius">, x: number, y: number) {
  const { w, h } = el;
  ctx.beginPath();
  switch (el.shape) {
    case "ellipse":
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case "triangle":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    case "diamond":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    case "star": {
      const cx = x + w / 2;
      const cy = y + h / 2;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.4 : 1;
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = cx + Math.cos(ang) * (w / 2) * r;
        const py = cy + Math.sin(ang) * (h / 2) * r;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case "arrow":
      ctx.moveTo(x, y + h * 0.3);
      ctx.lineTo(x + w * 0.62, y + h * 0.3);
      ctx.lineTo(x + w * 0.62, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w * 0.62, y + h);
      ctx.lineTo(x + w * 0.62, y + h * 0.7);
      ctx.lineTo(x, y + h * 0.7);
      ctx.closePath();
      break;
    case "pill":
      roundRectPath(ctx, x, y, w, h, h / 2);
      break;
    case "line":
      ctx.rect(x, y, w, Math.max(1, h));
      break;
    default:
      roundRectPath(ctx, x, y, w, h, el.radius ?? 0);
  }
}

function gradient(ctx: CanvasRenderingContext2D, g: { from: string; to: string; angle: number }, x: number, y: number, w: number, h: number, brand: Brand) {
  // CSS angles: 0 = to top, 90 = to right, 180 = to bottom.
  const rad = ((g.angle - 90) * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const len = (Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) / 2;
  const gr = ctx.createLinearGradient(cx - Math.cos(rad) * len, cy - Math.sin(rad) * len, cx + Math.cos(rad) * len, cy + Math.sin(rad) * len);
  gr.addColorStop(0, color(g.from, brand));
  gr.addColorStop(1, color(g.to, brand));
  return gr;
}

// ---- images

function drawImageFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, el: ImageEl, x: number, y: number, zoom: number) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  if (el.fit === "contain") {
    const s = Math.min(el.w / iw, el.h / ih) * zoom;
    ctx.drawImage(img, x + (el.w - iw * s) / 2, y + (el.h - ih * s) / 2, iw * s, ih * s);
    return;
  }
  const s = Math.max(el.w / iw, el.h / ih) * zoom;
  const sw = el.w / s;
  const sh = el.h / s;
  const fx = el.fx ?? 0.5;
  const fy = el.fy ?? 0.5;
  const sx = clamp((iw - sw) * fx, 0, Math.max(0, iw - sw));
  const sy = clamp((ih - sh) * fy, 0, Math.max(0, ih - sh));
  ctx.drawImage(img, sx, sy, sw, sh, x, y, el.w, el.h);
}

export interface DrawOpts {
  images: ImageCache;
  /** Seconds into the slide; undefined = everything fully shown (static). */
  t?: number;
  /** Show hints and empty photo frames ("Add photo"). Off for exports. */
  placeholders?: boolean;
  /** Skip these element ids (the editor hides the one being edited as text). */
  hide?: Set<string>;
}

export function drawElement(ctx: CanvasRenderingContext2D, raw: El, doc: TeaserDoc, slide: Slide, o: DrawOpts) {
  if (o.hide?.has(raw.id)) return;
  if (raw.name === "hint" && !o.placeholders) return;
  const el = liveEl(raw, doc, !!o.placeholders);
  const brand = doc.brand;
  let st: AnimState = { alpha: 1, dx: 0, dy: 0, scale: 1, clip: 1 };
  if (o.t !== undefined && el.anim && el.anim.type !== "none") {
    const p = clamp((o.t - (el.anim.delay ?? 0)) / (el.anim.dur ?? 0.7));
    if (p <= 0) return;
    st = animAt(el.anim.type, p);
  }
  const alpha = (el.opacity ?? 1) * st.alpha;
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const cx = el.x + el.w / 2 + st.dx;
  const cy = el.y + el.h / 2 + st.dy;
  ctx.translate(cx, cy);
  if (el.rot) ctx.rotate((el.rot * Math.PI) / 180);
  if (st.scale !== 1) ctx.scale(st.scale, st.scale);
  const x = -el.w / 2;
  const y = -el.h / 2;
  if (st.clip < 1) {
    ctx.beginPath();
    ctx.rect(x, y - 2000, el.w * st.clip, el.h + 4000);
    ctx.clip();
  }

  if (el.type === "shape") {
    if (el.shape === "line") {
      ctx.fillStyle = color(el.stroke && el.fill === "transparent" ? el.stroke : el.fill, brand);
      ctx.fillRect(x, y, el.w, Math.max(1, el.h));
    } else {
      shapePath(ctx, el, x, y);
      if (el.grad) {
        ctx.fillStyle = gradient(ctx, el.grad, x, y, el.w, el.h, brand);
        ctx.fill();
      } else if (el.fill && el.fill !== "transparent") {
        ctx.fillStyle = color(el.fill, brand);
        ctx.fill();
      }
      if (el.stroke && el.strokeW) {
        ctx.strokeStyle = color(el.stroke, brand);
        ctx.lineWidth = el.strokeW;
        ctx.stroke();
      }
    }
  } else if (el.type === "image") {
    ctx.save();
    roundRectPath(ctx, x, y, el.w, el.h, el.radius ?? 0);
    ctx.clip();
    const img = el.src ? o.images.get(el.src) : undefined;
    if (img) {
      const kb = el.kenburns && o.t !== undefined ? 1 + 0.12 * clamp(o.t / Math.max(1, slide.duration)) : 1;
      drawImageFit(ctx, img, el, x, y, kb);
    } else {
      // Empty frame: a soft brand gradient (and a hint in the editor).
      ctx.fillStyle = gradient(ctx, { from: "$secondary", to: "$primary/45", angle: 135 }, x, y, el.w, el.h, brand);
      ctx.fillRect(x, y, el.w, el.h);
      if (o.placeholders && el.w > 120 && el.h > 80 && el.bind !== "brand.logo") {
        const ic = o.images.get(iconKey("camera", "#ffffff", 1.5));
        const s = Math.min(96, el.h * 0.3);
        if (ic) ctx.drawImage(ic, -s / 2 + x + el.w / 2, y + el.h / 2 - s * 0.85, s, s);
        ctx.fillStyle = "#ffffff";
        ctx.font = `600 ${Math.max(18, Math.min(30, el.w / 14))}px Poppins, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(el.src && o.images.isError(el.src) ? "Photo unavailable" : "Add photo", x + el.w / 2, y + el.h / 2 + 12);
      }
      if (o.placeholders && el.bind === "brand.logo" && !el.src) {
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.setLineDash([8, 8]);
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, el.w - 4, el.h - 4);
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = "600 22px Poppins, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Your logo", x + el.w / 2, y + el.h / 2);
      }
    }
    if (el.overlay) {
      ctx.fillStyle = color(el.overlay, brand);
      ctx.fillRect(x, y, el.w, el.h);
    }
    ctx.restore();
    if (el.stroke && el.strokeW) {
      roundRectPath(ctx, x, y, el.w, el.h, el.radius ?? 0);
      ctx.strokeStyle = color(el.stroke, brand);
      ctx.lineWidth = el.strokeW;
      ctx.stroke();
    }
  } else if (el.type === "icon") {
    if (el.bg) {
      ctx.fillStyle = color(el.bg, brand);
      if (el.bgShape === "square") roundRectPath(ctx, x, y, el.w, el.h, el.w * 0.22);
      else {
        ctx.beginPath();
        ctx.ellipse(0, 0, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    const img = o.images.get(iconKey(el.icon, color(el.color, brand), el.strokeW ?? 2));
    const pad = el.bg ? el.w * 0.22 : 0;
    if (img) ctx.drawImage(img, x + pad, y + pad, el.w - pad * 2, el.h - pad * 2);
  } else {
    drawText(ctx, el, brand, x, y);
  }
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, el: TextEl, brand: Brand, x: number, y: number) {
  if (!el.text) return;
  const { lines, lineH, height } = layoutText(ctx, el, brand);
  const pad = el.bg ? (el.pad ?? 16) : 0;
  if (el.bg) {
    ctx.fillStyle = color(el.bg, brand);
    roundRectPath(ctx, x, y, el.w, Math.max(el.h, height + pad * 2), el.radius ?? 0);
    ctx.fill();
  }
  ctx.fillStyle = color(el.color, brand);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = el.align;
  if (el.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = el.size * 0.4;
    ctx.shadowOffsetY = el.size * 0.06;
  }
  const tx = el.align === "center" ? x + el.w / 2 : el.align === "right" ? x + el.w - pad : x + pad;
  lines.forEach((ln, i) => {
    const by = y + pad + i * lineH + el.size * 0.86;
    ctx.fillText(ln, tx, by);
    if (el.underline) {
      const wdt = ctx.measureText(ln).width;
      const lx = el.align === "center" ? tx - wdt / 2 : el.align === "right" ? tx - wdt : tx;
      ctx.fillRect(lx, by + el.size * 0.1, wdt, Math.max(1, el.size * 0.06));
    }
  });
  ctx.shadowColor = "transparent";
}

/** Draws a whole slide into a context already scaled to design pixels. */
export function drawSlide(ctx: CanvasRenderingContext2D, doc: TeaserDoc, slide: Slide, o: DrawOpts) {
  const { width: W, height: H } = doc;
  ctx.save();
  ctx.fillStyle = slide.bgGrad ? gradient(ctx, slide.bgGrad, 0, 0, W, H, doc.brand) : color(slide.bg, doc.brand);
  ctx.fillRect(0, 0, W, H);
  for (const el of slide.elements) drawElement(ctx, el, doc, slide, o);
  ctx.restore();
}

/** Renders one slide to a new canvas at `scale` (1 = design size). */
export function renderToCanvas(doc: TeaserDoc, slide: Slide, images: ImageCache, scale = 1, t?: number, placeholders = false) {
  const c = document.createElement("canvas");
  c.width = Math.round(doc.width * scale);
  c.height = Math.round(doc.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  drawSlide(ctx, doc, slide, { images, t, placeholders });
  return c;
}

/** Text box height after wrapping (used to fit selection boxes and PowerPoint text frames). */
export function measureTextHeight(el: TextEl, brand: Brand) {
  const c = document.createElement("canvas").getContext("2d")!;
  const { height } = layoutText(c, el, brand);
  return height + (el.bg ? (el.pad ?? 16) * 2 : 0);
}

/** Whole-trailer frame at time t: slides in order with cross-fades between them. */
export function trailerTimeline(doc: TeaserDoc) {
  const XF = 0.5;
  let t0 = 0;
  const items = doc.slides.map((s) => {
    const it = { slide: s, start: t0, end: t0 + s.duration };
    t0 += s.duration;
    return it;
  });
  return { items, total: t0, xf: XF };
}

export function drawTrailerFrame(ctx: CanvasRenderingContext2D, doc: TeaserDoc, time: number, images: ImageCache) {
  const { items, xf } = trailerTimeline(doc);
  const i = Math.max(0, items.findIndex((it) => time < it.end));
  const cur = items[i === -1 ? items.length - 1 : i]!;
  drawSlide(ctx, doc, cur.slide, { images, t: time - cur.start });
  const next = items[i + 1];
  if (next && cur.end - time < xf && next.slide.transition !== "none") {
    const p = 1 - (cur.end - time) / xf;
    ctx.save();
    ctx.globalAlpha = easeOut(p);
    if (next.slide.transition === "zoom") {
      const s = 1.08 - 0.08 * p;
      ctx.translate(doc.width / 2, doc.height / 2);
      ctx.scale(s, s);
      ctx.translate(-doc.width / 2, -doc.height / 2);
    } else if (next.slide.transition === "slide") ctx.translate((1 - easeOut(p)) * doc.width * 0.15, 0);
    drawSlide(ctx, doc, next.slide, { images, t: 0 });
    ctx.restore();
  }
}
