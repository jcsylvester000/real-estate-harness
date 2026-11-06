/**
 * Property Teaser templates: 20 presentation decks and 10 teaser trailers.
 * A template is a theme (colours, fonts, motif) plus a recipe of slide layouts. Layouts are built from the
 * project's details through bindings, so one set of details fills any template and switching templates keeps
 * the content. Colours and fonts are brand tokens ($primary, $head…), so the Brand panel recolours everything.
 */
import { amenityInfo, AMENITY } from "./amenities";
import type { Anim, Brand, El, Gen, IconEl, ImageEl, ShapeEl, Slide, TeaserDoc, TeaserKind, TextEl, Transition } from "./types";
import { emptyAgent, emptyProperty, uid } from "./types";

export type Motif = "luxury" | "minimal" | "bold" | "editorial" | "geometric" | "soft" | "corporate" | "photo";
type Role = NonNullable<Slide["role"]> | "scene-hook" | "scene-title" | "scene-facts" | "scene-highlight" | "scene-amenities" | "scene-photo" | "scene-cta" | "scene-stamp";

export interface Theme {
  primary: string;
  secondary: string;
  accent: string;
  ink: string;
  paper: string;
  headFont: string;
  bodyFont: string;
  motif: Motif;
  upper?: boolean;
  italic?: boolean;
  /** Letter spacing for headings. */
  spacing?: number;
  /** Corner radius for photos and cards. */
  radius: number;
  /** Cover variant. */
  cover: "full" | "split" | "framed" | "block" | "arch" | "editorial";
  /** Dark content slides (paper text on primary). */
  darkBody?: boolean;
}

export interface Template {
  id: string;
  name: string;
  kind: TeaserKind;
  category: string;
  description: string;
  vertical?: boolean;
  theme: Theme;
  recipe: Role[];
  /** Trailer stamp text ("Just listed", "Price drop", "Open house"). */
  stamp?: string;
  /** Seconds per trailer scene. */
  pace?: number;
  /** Letterbox bars for cinematic trailers. */
  letterbox?: boolean;
}

// ---------------------------------------------------------------- element helpers

type Box = { x: number; y: number; w: number; h: number };
const T = (o: Partial<TextEl> & Box): TextEl => ({ id: uid(), type: "text", text: "", font: "$body", size: 32, weight: 400, color: "$ink", align: "left", lineHeight: 1.35, ...o });
const S = (o: Partial<ShapeEl> & Box): ShapeEl => ({ id: uid(), type: "shape", shape: "rect", fill: "$primary", ...o });
const I = (o: Partial<ImageEl> & Box): ImageEl => ({ id: uid(), type: "image", src: null, fit: "cover", ...o });
const C = (o: Partial<IconEl> & Box & { icon: string }): IconEl => ({ id: uid(), type: "icon", color: "$accent", strokeW: 1.75, ...o });
const a = (type: Anim, delay = 0, dur = 0.7) => ({ type, delay, dur });

interface Ctx {
  W: number;
  H: number;
  P: boolean; // portrait
  th: Theme;
  trailer: boolean;
  tpl: Template;
}

/** Heading text styled by the theme. */
function H(c: Ctx, o: Partial<TextEl> & Box): TextEl {
  return T({ font: "$head", weight: c.th.motif === "bold" || c.th.motif === "corporate" ? 700 : 400, upper: c.th.upper, italic: c.th.italic, spacing: c.th.spacing ?? 0, lineHeight: 1.08, color: "$ink", ...o });
}
/** Small spaced label above headings. */
function eyebrow(c: Ctx, text: string, o: Box & Partial<TextEl>): TextEl {
  return T({ text, size: c.P ? 30 : 24, weight: 700, upper: true, spacing: 6, color: "$accent", ...o });
}
const PAD = (c: Ctx) => (c.P ? 90 : 120);

function slide(c: Ctx, role: Slide["role"], elements: El[], o: Partial<Slide> = {}): Slide {
  const dur = c.trailer ? (c.tpl.pace ?? 3.2) : 5;
  return { id: uid("s"), role, bg: c.th.darkBody ? "$primary" : "$paper", duration: dur, transition: (c.trailer ? "fade" : "none") as Transition, elements, ...o };
}

/** Theme decorations layered on content slides. */
function decor(c: Ctx, dark: boolean): El[] {
  const { W, H: Ht } = c;
  const line = dark ? "$paper/25" : "$ink/15";
  switch (c.th.motif) {
    case "luxury":
      return [S({ x: 40, y: 40, w: W - 80, h: Ht - 80, fill: "transparent", stroke: "$accent/70", strokeW: 2, locked: true, name: "Frame" })];
    case "minimal":
      return [S({ x: PAD(c), y: Ht - 70, w: W - PAD(c) * 2, h: 2, fill: line, locked: true, name: "Rule" })];
    case "bold":
      return [S({ x: 0, y: 0, w: c.P ? W : 28, h: c.P ? 28 : Ht, fill: "$accent", locked: true, name: "Bar" })];
    case "editorial":
      return [S({ x: PAD(c), y: 70, w: 120, h: 6, fill: "$accent", locked: true, name: "Accent" })];
    case "geometric":
      return [
        S({ shape: "ellipse", x: W - (c.P ? 360 : 420), y: -(c.P ? 160 : 220), w: c.P ? 560 : 640, h: c.P ? 560 : 640, fill: "$accent/18", locked: true, name: "Circle" }),
        S({ shape: "triangle", x: -60, y: Ht - 220, w: 300, h: 260, fill: "$secondary/30", rot: -12, locked: true, name: "Triangle" }),
      ];
    case "soft":
      return [S({ shape: "ellipse", x: -180, y: Ht - 320, w: 520, h: 520, fill: "$secondary/35", locked: true, name: "Blob" })];
    case "corporate":
      return [S({ x: 0, y: 0, w: W, h: 16, fill: "$accent", locked: true, name: "Top band" })];
    default:
      return [];
  }
}

/** Logo spot (top corner). */
const logo = (c: Ctx, x: number, y: number, w = 220, h = 90): ImageEl => I({ x, y, w, h, fit: "contain", bind: "brand.logo", name: "Logo" });

// ---------------------------------------------------------------- generators (auto elements)

export function generate(g: Gen, doc: TeaserDoc): El[] {
  const p = doc.property;
  const { x, y, w, h } = g.box;
  const st = g.style;
  const anim = st.anim;
  const out: El[] = [];
  const hint = (text: string) =>
    out.push(T({ x, y, w, h: 80, text, size: 28, color: st.dark ? "$paper/60" : "$ink/50", italic: true, auto: true, name: "hint" }));

  if (g.type === "amenities") {
    const items = p.amenities.slice(0, st.max ?? 12);
    if (!items.length) {
      hint("Tick features and amenities in Details, and they appear here.");
      return out;
    }
    const cols = st.cols ?? (items.length <= 4 ? items.length : items.length <= 6 ? 3 : 4);
    const rows = Math.ceil(items.length / cols);
    const gap = 28;
    const cw = (w - gap * (cols - 1)) / cols;
    const ch = Math.min((h - gap * (rows - 1)) / rows, st.card ? 240 : 200);
    const ic = st.iconSize ?? Math.min(84, ch * 0.42);
    items.forEach((_, i) => {
      const cx = x + (i % cols) * (cw + gap);
      const cy = y + Math.floor(i / cols) * (ch + gap);
      const an = anim ? a(anim, 0.25 + i * 0.12, 0.5) : undefined;
      if (st.card) out.push(S({ x: cx, y: cy, w: cw, h: ch, shape: "rect", radius: 22, fill: st.dark ? "$paper/10" : "$primary/7", stroke: st.dark ? "$paper/20" : "$primary/12", strokeW: 1.5, auto: true, anim: an, name: "Card" }));
      out.push(C({ x: cx + cw / 2 - ic / 2, y: cy + ch * 0.16, w: ic, h: ic, icon: amenityInfo(p.amenities[i]!).icon, bind: `amenityIcon:${i}`, color: st.dark ? "$accent" : "$primary", auto: true, anim: an }));
      out.push(T({ x: cx + 10, y: cy + ch * 0.16 + ic + 18, w: cw - 20, h: ch * 0.4, text: "", bind: `amenity:${i}`, size: st.textSize ?? 28, align: "center", color: st.dark ? "$paper" : "$ink", lineHeight: 1.2, auto: true, anim: an }));
    });
    return out;
  }

  if (g.type === "facts") {
    // Only the facts the property has (a lot has no bedrooms); placeholders until details are filled.
    const all: [string, string, string, boolean][] = [
      ["bed", "property.beds", "Bedrooms", p.bedrooms !== null],
      ["bath", "property.baths", "Bathrooms", !!p.bathrooms],
      ["maximize", "property.floorN", "Floor sqm", !!p.floorArea],
      ["ruler", "property.lotN", "Lot sqm", !!p.lotArea],
      ["car", "property.parking", "Parking", !!p.parking],
    ];
    let items = all.filter((f) => f[3]);
    if (!items.length) items = [all[0]!, all[2]!];
    const cols = st.cols ?? items.length;
    const cw = w / cols;
    const rowH = 230;
    items.forEach(([icon, bind, label], i) => {
      const cx = x + (i % cols) * cw;
      const cy = y + Math.floor(i / cols) * rowH;
      const an = anim ? a(anim, 0.3 + i * 0.15, 0.5) : undefined;
      out.push(C({ x: cx, y: cy, w: 64, h: 64, icon, color: "$accent", auto: true, anim: an }));
      out.push(T({ x: cx, y: cy + 80, w: cw - 16, h: 70, bind, font: "$head", size: cols > 4 ? 44 : 52, weight: 700, color: st.dark ? "$paper" : "$ink", auto: true, anim: an }));
      out.push(T({ x: cx, y: cy + 150, w: cw - 16, h: 40, text: label, size: cols > 4 ? 20 : 24, upper: true, spacing: cols > 4 ? 2 : 3, color: st.dark ? "$paper/60" : "$ink/55", auto: true, anim: an }));
    });
    return out;
  }

  if (g.type === "highlights") {
    const from = st.from ?? 0;
    const items = p.highlights.slice(from, from + (st.max ?? 5));
    if (!items.length) {
      hint("Add highlights in Details (or let Write it for me find them).");
      return out;
    }
    const rowH = Math.min(h / items.length, 130);
    items.forEach((_, j) => {
      const i = from + j;
      const ry = y + j * rowH;
      const an = anim ? a(anim, 0.3 + j * 0.25, 0.6) : undefined;
      if (st.numbered) out.push(T({ x, y: ry, w: 110, h: rowH, text: String(j + 1).padStart(2, "0"), font: "$head", size: Math.min(64, rowH * 0.55), color: "$accent", auto: true, anim: an, lineHeight: 1 }));
      else out.push(C({ x, y: ry + 4, w: 48, h: 48, icon: "circle-check", color: "$accent", auto: true, anim: an }));
      out.push(T({ x: x + (st.numbered ? 130 : 76), y: ry + (st.numbered ? 8 : 6), w: w - (st.numbered ? 130 : 76), h: rowH - 10, text: "", bind: `highlight:${i}`, size: st.textSize ?? 36, color: st.dark ? "$paper" : "$ink", lineHeight: 1.25, auto: true, anim: an }));
    });
    return out;
  }

  if (g.type === "gallery") {
    const from = st.from ?? 1;
    const n = st.max ?? 4;
    const cols = st.cols ?? (n === 3 ? 3 : 2);
    const rows = Math.ceil(n / cols);
    const gap = 24;
    const cw = (w - gap * (cols - 1)) / cols;
    const ch = (h - gap * (rows - 1)) / rows;
    for (let i = 0; i < n; i++)
      out.push(I({ x: x + (i % cols) * (cw + gap), y: y + Math.floor(i / cols) * (ch + gap), w: cw, h: ch, bind: `photo:${from + i}`, radius: st.card ? 18 : 0, auto: true, anim: anim ? a(anim, 0.2 + i * 0.15) : undefined }));
    return out;
  }

  // nearby
  const near = p.nearby.length ? p.nearby : p.amenities.filter((id) => AMENITY[id]?.group === "Nearby").map((id) => amenityInfo(id).label);
  if (!near.length) {
    hint("Add nearby places in Details (schools, malls, stations…).");
    return out;
  }
  const rowH = Math.min(h / Math.min(near.length, st.max ?? 6), 96);
  near.slice(0, st.max ?? 6).forEach((label, i) => {
    const ry = y + i * rowH;
    const an = anim ? a(anim, 0.3 + i * 0.15, 0.5) : undefined;
    out.push(C({ x, y: ry, w: 44, h: 44, icon: "map-pin", color: "$accent", auto: true, anim: an }));
    out.push(T({ x: x + 66, y: ry + 2, w: w - 66, h: rowH - 8, text: p.nearby.length ? "" : label, bind: p.nearby.length ? `nearby:${i}` : undefined, size: st.textSize ?? 32, color: st.dark ? "$paper" : "$ink", auto: true, anim: an }));
  });
  return out;
}

/** Re-creates auto elements on every slide that has a generator (unless detached). */
export function applyGenerators(doc: TeaserDoc): TeaserDoc {
  return {
    ...doc,
    slides: doc.slides.map((s) => {
      if (!s.gen || s.detached) return s;
      const at = s.elements.findIndex((e) => e.auto);
      const rest = s.elements.filter((e) => !e.auto);
      const gen = generate(s.gen, doc);
      const idx = at === -1 ? rest.length : Math.min(at, rest.length);
      return { ...s, elements: [...rest.slice(0, idx), ...gen, ...rest.slice(idx)] };
    }),
  };
}

function withGen(c: Ctx, s: Slide, gen: Gen, doc: TeaserDoc): Slide {
  const els = generate(gen, doc);
  return { ...s, gen, elements: [...s.elements, ...els] };
}

// ---------------------------------------------------------------- deck layouts

function cover(c: Ctx): Slide {
  const { W, H: Ht, P, th } = c;
  const pad = PAD(c);
  const big = P ? 120 : 112;
  const tr = c.trailer;
  const an = (t: Anim, d: number) => (tr ? a(t, d) : undefined);
  const name = (o: Box & Partial<TextEl>) => H(c, { text: "", bind: "property.name", size: big, ...o, anim: an("rise", 0.3) });
  const tag = (o: Box & Partial<TextEl>) => T({ bind: "property.tagline", size: P ? 40 : 38, ...o, anim: an("fade", 0.7) });
  const price = (o: Box & Partial<TextEl>) => T({ bind: "property.price", font: "$head", size: P ? 64 : 56, weight: 700, ...o, anim: an("pop", 1.0) });
  const tx = (o: Box & Partial<TextEl>) => eyebrow(c, "", { bind: "property.transaction", ...o, anim: an("fade", 0.1) });

  switch (th.cover) {
    case "split": {
      const els: El[] = P
        ? [
            I({ x: 0, y: 0, w: W, h: Ht * 0.52, bind: "photo:0", kenburns: tr }),
            S({ x: 0, y: Ht * 0.52, w: W, h: Ht * 0.48, fill: "$primary" }),
            tx({ x: pad, y: Ht * 0.52 + 80, w: W - pad * 2, h: 40, color: "$accent" }),
            name({ x: pad, y: Ht * 0.52 + 140, w: W - pad * 2, h: 300, color: "$paper" }),
            tag({ x: pad, y: Ht * 0.52 + 470, w: W - pad * 2, h: 120, color: "$paper/80" }),
            price({ x: pad, y: Ht - 260, w: W - pad * 2, h: 80, color: "$accent" }),
            logo(c, pad, 60),
          ]
        : [
            S({ x: 0, y: 0, w: W * 0.46, h: Ht, fill: "$primary" }),
            I({ x: W * 0.46, y: 0, w: W * 0.54, h: Ht, bind: "photo:0", kenburns: tr }),
            logo(c, pad, 90),
            tx({ x: pad, y: 330, w: W * 0.46 - pad * 1.5, h: 40, color: "$accent" }),
            name({ x: pad, y: 390, w: W * 0.46 - pad * 1.5, h: 300, color: "$paper", size: 96 }),
            tag({ x: pad, y: 700, w: W * 0.46 - pad * 1.5, h: 110, color: "$paper/80", size: 34 }),
            price({ x: pad, y: 860, w: W * 0.46 - pad * 1.5, h: 80, color: "$accent", size: 52 }),
          ];
      return slide(c, "cover", els, { bg: "$primary" });
    }
    case "framed": {
      const ph = P ? Ht * 0.5 : Ht * 0.6;
      return slide(
        c,
        "cover",
        [
          I({ x: pad, y: pad, w: W - pad * 2, h: ph, bind: "photo:0", radius: th.radius, kenburns: tr }),
          logo(c, W - pad - 220, pad + ph + 50),
          tx({ x: pad, y: pad + ph + 60, w: 700, h: 40 }),
          name({ x: pad, y: pad + ph + 110, w: W - pad * 2 - (P ? 0 : 260), h: P ? 300 : 160, size: P ? 104 : 92 }),
          tag({ x: pad, y: pad + ph + (P ? 430 : 270), w: P ? W - pad * 2 : W * 0.55, h: 90, color: "$ink/70", size: 32 }),
          price({ x: P ? pad : W * 0.6, y: P ? Ht - 230 : pad + ph + 270, w: P ? W - pad * 2 : W * 0.4 - pad, h: 80, align: P ? "left" : "right", color: "$primary", size: 52 }),
        ],
        { bg: "$paper" },
      );
    }
    case "block": {
      const bh = P ? Ht * 0.4 : Ht * 0.36;
      return slide(c, "cover", [
        I({ x: 0, y: 0, w: W, h: Ht - bh + 2, bind: "photo:0", kenburns: tr }),
        S({ x: 0, y: Ht - bh, w: W, h: bh, fill: "$primary" }),
        S({ x: pad, y: Ht - bh - 34, w: P ? 360 : 300, h: 68, fill: "$accent", shape: "pill", anim: an("pop", 0.2) }),
        T({ x: pad, y: Ht - bh - 22, w: P ? 360 : 300, h: 50, bind: "property.transaction", size: 28, weight: 700, upper: true, spacing: 4, align: "center", color: "$ink", anim: an("pop", 0.2) }),
        name({ x: pad, y: Ht - bh + 70, w: P ? W - pad * 2 : W * 0.62, h: P ? 280 : 200, color: "$paper", size: P ? 104 : 96 }),
        price({ x: P ? pad : W * 0.62, y: P ? Ht - 200 : Ht - bh + 90, w: P ? W - pad * 2 : W * 0.38 - pad, h: 80, align: P ? "left" : "right", color: "$accent" }),
        tag({ x: P ? pad : W * 0.62, y: P ? Ht - 120 : Ht - bh + 190, w: P ? W - pad * 2 : W * 0.38 - pad, h: 90, align: P ? "left" : "right", color: "$paper/80", size: 30 }),
        logo(c, pad, 60),
      ], { bg: "$primary" });
    }
    case "arch": {
      const els: El[] = P
        ? [
            I({ x: 140, y: 140, w: W - 280, h: Ht * 0.5, bind: "photo:0", radius: (W - 280) / 2, kenburns: tr }),
            tx({ x: pad, y: Ht * 0.5 + 220, w: W - pad * 2, h: 40, align: "center" }),
            name({ x: pad, y: Ht * 0.5 + 280, w: W - pad * 2, h: 260, align: "center", size: 100 }),
            tag({ x: pad, y: Ht * 0.5 + 560, w: W - pad * 2, h: 100, align: "center", color: "$ink/70" }),
            price({ x: pad, y: Ht - 220, w: W - pad * 2, h: 80, align: "center", color: "$primary" }),
            logo(c, W / 2 - 110, 30, 220, 90),
          ]
        : [
            I({ x: W - 820, y: 110, w: 680, h: Ht - 110, bind: "photo:0", radius: 340, kenburns: tr }),
            logo(c, pad, 90),
            tx({ x: pad, y: 330, w: 900, h: 40 }),
            name({ x: pad, y: 390, w: 960, h: 320, size: 104 }),
            tag({ x: pad, y: 720, w: 860, h: 110, color: "$ink/70", size: 36 }),
            price({ x: pad, y: 870, w: 860, h: 80, color: "$primary" }),
          ];
      return slide(c, "cover", els, { bg: "$paper" });
    }
    case "editorial": {
      return slide(c, "cover", [
        T({ x: pad, y: 70, w: 400, h: 60, text: "01", font: "$head", size: 48, color: "$accent" }),
        logo(c, W - pad - 220, 60),
        name({ x: pad, y: P ? 170 : 150, w: W - pad * 2, h: P ? 360 : 250, size: P ? 120 : 120 }),
        I({ x: P ? 0 : W * 0.38, y: P ? 640 : 430, w: P ? W : W * 0.62, h: P ? Ht - 640 : Ht - 430, bind: "photo:0", kenburns: tr }),
        tx({ x: pad, y: P ? 560 : 450, w: P ? W - pad * 2 : W * 0.38 - pad - 40, h: 40 }),
        tag({ x: pad, y: P ? Ht - 320 : 510, w: P ? W - pad * 2 : W * 0.38 - pad - 40, h: 200, color: P ? "$paper" : "$ink/75", size: 36, shadow: P }),
        price({ x: pad, y: P ? Ht - 170 : Ht - 200, w: P ? W - pad * 2 : W * 0.38 - pad - 40, h: 80, color: P ? "$paper" : "$primary", shadow: P }),
      ], { bg: "$paper" });
    }
    default: {
      // full-bleed photo
      const centered = th.motif === "luxury" || th.motif === "minimal" || P;
      return slide(c, "cover", [
        I({ x: 0, y: 0, w: W, h: Ht, bind: "photo:0", kenburns: tr }),
        S({ x: 0, y: 0, w: W, h: Ht, fill: "$ink/0", grad: { from: "$ink/10", to: "$ink/85", angle: 180 }, name: "Shade" }),
        ...(c.tpl.letterbox ? [S({ x: 0, y: 0, w: W, h: Ht * 0.1, fill: "#000000", locked: true, name: "Bar" }), S({ x: 0, y: Ht * 0.9, w: W, h: Ht * 0.1, fill: "#000000", locked: true, name: "Bar" })] : []),
        logo(c, centered ? W / 2 - 110 : pad, P ? 120 : 80),
        tx({ x: pad, y: Ht - (P ? 760 : 520), w: W - pad * 2, h: 40, align: centered ? "center" : "left", color: "$accent" }),
        name({ x: pad, y: Ht - (P ? 700 : 460), w: W - pad * 2, h: P ? 330 : 200, align: centered ? "center" : "left", color: "#ffffff", shadow: true }),
        tag({ x: pad, y: Ht - (P ? 350 : 250), w: W - pad * 2, h: 70, align: centered ? "center" : "left", color: "#ffffffd9", shadow: true }),
        price({ x: pad, y: Ht - (P ? 260 : 170), w: W - pad * 2, h: 80, align: centered ? "center" : "left", color: "$accent", shadow: true }),
      ], { bg: "$ink" });
    }
  }
}

function heading(c: Ctx, label: string, title: string, x: number, y: number, w: number, dark: boolean, o: Partial<TextEl> = {}): El[] {
  const an = c.trailer ? a("rise", 0.1) : undefined;
  return [
    eyebrow(c, label, { x, y, w, h: 40, color: "$accent", anim: an }),
    H(c, { x, y: y + 50, w, h: 140, text: title, size: c.P ? 84 : 76, color: dark ? "$paper" : "$ink", anim: an, ...o }),
  ];
}

function overview(c: Ctx, doc: TeaserDoc): Slide {
  const { W, H: Ht, P, th } = c;
  const dark = !!th.darkBody;
  const pad = PAD(c);
  const areaW = P ? W - pad * 2 : W * 0.56 - pad;
  const els: El[] = [...decor(c, dark), ...heading(c, "At a glance", "Key details", pad, 110, areaW, dark)];
  const factsGen: Gen = { type: "facts", box: { x: pad, y: P ? 420 : 400, w: areaW, h: P ? 700 : 240 }, style: { cols: P ? 2 : undefined, dark, anim: c.trailer ? "pop" : undefined } };
  const shownN = Math.max(1, generate(factsGen, doc).length / 3);
  const py = P ? 420 + Math.ceil(shownN / 2) * 230 + 20 : 700;
  els.push(S({ x: pad, y: py, w: areaW, h: 2, fill: dark ? "$paper/20" : "$ink/12" }));
  els.push(T({ x: pad, y: py + 40, w: areaW, h: 40, text: "Price", size: 24, upper: true, spacing: 3, color: dark ? "$paper/60" : "$ink/55" }));
  els.push(T({ x: pad, y: py + 85, w: areaW, h: 90, bind: "property.price", font: "$head", size: 72, weight: 700, color: "$primary", ...(dark ? { color: "$accent" } : {}) }));
  if (P) els.push(I({ x: 0, y: Ht - 520, w: W, h: 520, bind: "photo:1" }));
  else els.push(I({ x: W * 0.56 + 40, y: th.motif === "luxury" ? 80 : 0, w: W * 0.44 - (th.motif === "luxury" ? 120 : 40), h: th.motif === "luxury" ? Ht - 160 : Ht, bind: "photo:1", radius: th.motif === "soft" ? th.radius : 0 }));
  return withGen(c, slide(c, "overview", els), factsGen, doc);
}

function description(c: Ctx): Slide {
  const { W, H: Ht, P, th } = c;
  const dark = !!th.darkBody;
  const pad = PAD(c);
  const textW = P ? W - pad * 2 : W * 0.5 - pad;
  return slide(c, "description", [
    ...decor(c, dark),
    P ? I({ x: 0, y: 0, w: W, h: Ht * 0.42, bind: "photo:2" }) : I({ x: 0, y: 0, w: W * 0.44, h: Ht, bind: "photo:2", radius: 0 }),
    ...heading(c, "The property", "About the home", P ? pad : W * 0.44 + 100, P ? Ht * 0.42 + 80 : 140, textW, dark),
    T({ x: P ? pad : W * 0.44 + 100, y: P ? Ht * 0.42 + 330 : 400, w: P ? textW : W * 0.56 - 100 - pad, h: P ? 700 : 560, bind: "property.description", size: P ? 38 : 34, lineHeight: 1.55, color: dark ? "$paper/85" : "$ink/80", anim: c.trailer ? a("fade", 0.5) : undefined }),
  ]);
}

function highlights(c: Ctx, doc: TeaserDoc): Slide {
  const { W, H: Ht, P, th } = c;
  const dark = !!th.darkBody;
  const pad = PAD(c);
  const listW = P ? W - pad * 2 : W * 0.55 - pad;
  const s = slide(c, "highlights", [...decor(c, dark), ...heading(c, "Highlights", "Why you'll love it", pad, 110, listW, dark), P ? I({ x: 0, y: Ht - 560, w: W, h: 560, bind: "photo:3" }) : I({ x: W * 0.58, y: 120, w: W * 0.42 - pad, h: Ht - 240, bind: "photo:3", radius: th.radius })]);
  return withGen(c, s, { type: "highlights", box: { x: pad, y: 380, w: listW, h: P ? Ht - 1000 : Ht - 480 }, style: { numbered: th.motif === "editorial" || th.motif === "luxury" || th.motif === "minimal", dark, max: P ? 5 : 5, textSize: P ? 38 : 36, anim: c.trailer ? "slideL" : undefined } }, doc);
}

function amenities(c: Ctx, doc: TeaserDoc): Slide {
  const { W, H: Ht, P, th } = c;
  const dark = !!th.darkBody;
  const pad = PAD(c);
  const s = slide(c, "amenities", [...decor(c, dark), ...heading(c, "Features & amenities", "Everything you need", pad, 110, W - pad * 2, dark)]);
  return withGen(c, s, { type: "amenities", box: { x: pad, y: P ? 400 : 380, w: W - pad * 2, h: Ht - (P ? 520 : 480) }, style: { card: th.motif !== "minimal" && th.motif !== "luxury", dark, cols: P ? 2 : undefined, max: P ? 10 : 12, anim: c.trailer ? "pop" : undefined } }, doc);
}

function gallery(c: Ctx, doc: TeaserDoc): Slide {
  const { W, H: Ht, P, th } = c;
  const dark = !!th.darkBody;
  const pad = PAD(c);
  const s = slide(c, "gallery", [...decor(c, dark), ...heading(c, "Gallery", "Take a closer look", pad, 90, W - pad * 2, dark, { h: 110 })]);
  return withGen(c, s, { type: "gallery", box: { x: pad, y: P ? 360 : 320, w: W - pad * 2, h: Ht - (P ? 460 : 400) }, style: { from: 1, max: P ? 4 : th.motif === "editorial" ? 3 : 4, cols: P ? 2 : th.motif === "editorial" ? 3 : 2, card: th.radius > 0, anim: c.trailer ? "zoom" : undefined } }, doc);
}

function location(c: Ctx, doc: TeaserDoc): Slide {
  const { W, H: Ht, P, th } = c;
  const dark = !!th.darkBody;
  const pad = PAD(c);
  const textW = P ? W - pad * 2 : W * 0.48 - pad;
  const s = slide(c, "location", [
    ...decor(c, dark),
    ...heading(c, "Location", "Where life happens", pad, 110, textW, dark),
    C({ x: pad, y: 360, w: 56, h: 56, icon: "map-pin", color: "$accent" }),
    T({ x: pad + 76, y: 360, w: textW - 76, h: 110, bind: "property.location", font: "$head", size: 46, color: dark ? "$paper" : "$ink" }),
    P ? I({ x: 0, y: Ht - 600, w: W, h: 600, bind: "photo:4" }) : I({ x: W * 0.52, y: 0, w: W * 0.48, h: Ht, bind: "photo:4" }),
  ]);
  return withGen(c, s, { type: "nearby", box: { x: pad, y: 520, w: textW, h: P ? Ht - 1200 : Ht - 640 }, style: { dark, max: P ? 5 : 6, anim: c.trailer ? "rise" : undefined } }, doc);
}

function pricing(c: Ctx): Slide {
  const { W, P } = c;
  const pad = PAD(c);
  return slide(
    c,
    "pricing",
    [
      ...decor(c, true),
      eyebrow(c, "Investment", { x: pad, y: P ? 420 : 220, w: W - pad * 2, h: 40, align: "center" }),
      T({ x: pad, y: P ? 490 : 290, w: W - pad * 2, h: 170, bind: "property.price", font: "$head", size: P ? 130 : 140, weight: 700, color: "$paper", align: "center", anim: c.trailer ? a("pop", 0.2) : undefined }),
      T({ x: pad, y: P ? 700 : 480, w: W - pad * 2, h: 50, bind: "property.facts", size: 32, color: "$paper/75", align: "center" }),
      S({ x: W / 2 - 60, y: P ? 800 : 580, w: 120, h: 4, fill: "$accent" }),
      T({ x: P ? pad : W * 0.2, y: P ? 860 : 640, w: P ? W - pad * 2 : W * 0.6, h: 260, bind: "property.terms", size: 34, color: "$paper/85", align: "center", lineHeight: 1.5 }),
    ],
    { bg: "$primary" },
  );
}

function contact(c: Ctx): Slide {
  const { W, H: Ht, P, th } = c;
  const pad = PAD(c);
  const dark = th.motif !== "minimal" && th.motif !== "soft";
  const ink = dark ? "$paper" : "$ink";
  const an = (d: number) => (c.trailer ? a("rise", d) : undefined);
  const cx = P ? pad : W * 0.5;
  const cw = P ? W - pad * 2 : W * 0.5 - pad;
  return slide(
    c,
    "contact",
    [
      ...(P ? [I({ x: 0, y: 0, w: W, h: Ht * 0.38, bind: "photo:0", overlay: "$ink/30" })] : [I({ x: 0, y: 0, w: W * 0.42, h: Ht, bind: "photo:0", overlay: "$ink/20" })]),
      logo(c, cx, P ? Ht * 0.38 + 70 : 140, 260, 110),
      H(c, { x: cx, y: P ? Ht * 0.38 + 230 : 300, w: cw, h: 200, text: "Schedule a private viewing", size: P ? 84 : 76, color: ink, anim: an(0.2) }),
      T({ x: cx, y: P ? Ht * 0.38 + 470 : 520, w: cw, h: 60, bind: "agent.name", font: "$head", size: 46, weight: 700, color: ink, anim: an(0.5) }),
      T({ x: cx, y: P ? Ht * 0.38 + 535 : 580, w: cw, h: 40, bind: "agent.title", size: 28, color: dark ? "$paper/70" : "$ink/60", anim: an(0.6) }),
      C({ x: cx, y: P ? Ht * 0.38 + 620 : 670, w: 44, h: 44, icon: "phone", color: "$accent", anim: an(0.8) }),
      T({ x: cx + 66, y: P ? Ht * 0.38 + 622 : 672, w: cw - 66, h: 50, bind: "agent.phone", size: 34, color: ink, anim: an(0.8) }),
      C({ x: cx, y: P ? Ht * 0.38 + 700 : 745, w: 44, h: 44, icon: "mail", color: "$accent", anim: an(0.9) }),
      T({ x: cx + 66, y: P ? Ht * 0.38 + 702 : 747, w: cw - 66, h: 50, bind: "agent.email", size: 34, color: ink, anim: an(0.9) }),
      T({ x: cx, y: P ? Ht - 160 : 880, w: cw, h: 40, bind: "agent.license", size: 24, color: dark ? "$paper/55" : "$ink/50", anim: an(1) }),
    ],
    { bg: dark ? "$primary" : "$paper" },
  );
}

// ---------------------------------------------------------------- trailer scenes

function sceneTitle(c: Ctx): Slide {
  const { W, H: Ht, P } = c;
  const pad = PAD(c);
  return slide(
    c,
    "custom",
    [
      I({ x: 0, y: 0, w: W, h: Ht, bind: "photo:1", kenburns: true, overlay: "$primary/70" }),
      ...(c.tpl.letterbox ? [S({ x: 0, y: 0, w: W, h: Ht * 0.1, fill: "#000000", locked: true }), S({ x: 0, y: Ht * 0.9, w: W, h: Ht * 0.1, fill: "#000000", locked: true })] : []),
      T({ x: pad, y: Ht / 2 - (P ? 300 : 210), w: W - pad * 2, h: 50, bind: "property.location", size: P ? 40 : 34, upper: true, spacing: 8, color: "$accent", align: "center", anim: a("fade", 0.2) }),
      H(c, { x: pad, y: Ht / 2 - (P ? 220 : 140), w: W - pad * 2, h: P ? 300 : 200, bind: "property.name", size: P ? 116 : 110, color: "#ffffff", align: "center", anim: a(c.th.motif === "luxury" ? "fade" : "rise", 0.5, 0.9) }),
      T({ x: pad, y: Ht / 2 + (P ? 120 : 90), w: W - pad * 2, h: 90, bind: "property.price", font: "$head", size: P ? 80 : 72, weight: 700, color: "$accent", align: "center", anim: a("pop", 1.2) }),
    ],
    { bg: "$ink" },
  );
}

function sceneFacts(c: Ctx, doc: TeaserDoc): Slide {
  const s = overview(c, doc);
  const r = regen(s, doc, true);
  const swap: Record<string, string> = { $ink: "$paper", "$ink/55": "$paper/60", $primary: "$accent", "$ink/12": "$paper/20" };
  const els = (r.elements ?? s.elements).map((e) => (e.type === "text" && swap[e.color] ? { ...e, color: swap[e.color]! } : e.type === "shape" && swap[e.fill] ? { ...e, fill: swap[e.fill]! } : e));
  return { ...s, ...r, bg: "$primary", elements: els };
}

function sceneHighlight(c: Ctx, i: number): Slide {
  const { W, H: Ht, P } = c;
  const pad = PAD(c);
  const band = P ? 420 : 260;
  return slide(
    c,
    "custom",
    [
      I({ x: 0, y: 0, w: W, h: Ht, bind: `photo:${(i % 4) + 1}`, kenburns: true }),
      S({ x: 0, y: Ht - band - (P ? 220 : 90), w: P ? W - 80 : W * 0.7, h: band, fill: "$primary/90", anim: a("slideL", 0.1, 0.6) }),
      T({ x: pad, y: Ht - band - (P ? 220 : 90) + 40, w: (P ? W - 80 : W * 0.7) - pad - 40, h: 40, text: `0${i + 1}`, font: "$head", size: 36, color: "$accent", anim: a("fade", 0.4) }),
      T({ x: pad, y: Ht - band - (P ? 220 : 90) + 95, w: (P ? W - 80 : W * 0.7) - pad - 40, h: band - 120, bind: `highlight:${i}`, font: "$head", size: P ? 64 : 56, color: "$paper", lineHeight: 1.15, anim: a("rise", 0.5) }),
    ],
    { bg: "$ink", duration: (c.tpl.pace ?? 3.2) - 0.4 },
  );
}

function scenePhoto(c: Ctx, i: number): Slide {
  return slide(c, "custom", [I({ x: 0, y: 0, w: c.W, h: c.H, bind: `photo:${i}`, kenburns: true })], { bg: "$ink", duration: 2.2, transition: "zoom" });
}

function sceneStamp(c: Ctx): Slide {
  const { W, H: Ht, P } = c;
  const sw = P ? 760 : 900;
  return slide(
    c,
    "custom",
    [
      I({ x: 0, y: 0, w: W, h: Ht, bind: "photo:0", kenburns: true, overlay: "$ink/35" }),
      S({ x: W / 2 - sw / 2, y: Ht / 2 - 150, w: sw, h: 300, fill: "$accent", rot: -6, radius: 24, anim: a("pop", 0.2, 0.6) }),
      T({ x: W / 2 - sw / 2, y: Ht / 2 - 95, w: sw, h: 200, text: c.tpl.stamp ?? "Just listed", font: "$head", size: P ? 120 : 130, weight: 700, upper: true, align: "center", color: "$ink", rot: -6, anim: a("pop", 0.25, 0.6) }),
    ],
    { bg: "$ink", duration: 2.4 },
  );
}

function sceneCta(c: Ctx): Slide {
  const s = contact(c);
  return { ...s, duration: (c.tpl.pace ?? 3.2) + 1.6 };
}

// ---------------------------------------------------------------- the 30 templates

const th = (o: Partial<Theme> & Pick<Theme, "primary" | "secondary" | "accent" | "headFont" | "bodyFont" | "motif" | "cover">): Theme => ({ ink: "#14161a", paper: "#ffffff", radius: 0, ...o });

const DECK: Role[] = ["cover", "overview", "description", "highlights", "amenities", "gallery", "location", "pricing", "contact"];
const DECK_SHORT: Role[] = ["cover", "overview", "highlights", "amenities", "gallery", "contact"];
const LAND: Role[] = ["cover", "overview", "description", "highlights", "location", "gallery", "pricing", "contact"];
const TRAILER: Role[] = ["scene-hook", "scene-title", "scene-facts", "scene-highlight", "scene-highlight", "scene-amenities", "scene-photo", "scene-cta"];
const REEL: Role[] = ["scene-hook", "scene-title", "scene-highlight", "scene-photo", "scene-highlight", "scene-amenities", "scene-cta"];
const STAMP: Role[] = ["scene-stamp", "scene-title", "scene-facts", "scene-highlight", "scene-photo", "scene-amenities", "scene-cta"];

export const TEMPLATES: Template[] = [
  // ---- 20 presentation decks
  { id: "grid-signature", name: "GRID Signature", kind: "deck", category: "Luxury", description: "Navy and bronze, serif headlines, gold frame.", recipe: DECK, theme: th({ primary: "#0e192f", secondary: "#c4d0e4", accent: "#be8562", ink: "#0e192f", paper: "#fbf8f3", headFont: "Playfair Display", bodyFont: "Poppins", motif: "luxury", cover: "full", spacing: 1 }) },
  { id: "midnight-gold", name: "Midnight Gold", kind: "deck", category: "Luxury", description: "Black and gold for prestige homes and penthouses.", recipe: DECK, theme: th({ primary: "#111111", secondary: "#3a3a3a", accent: "#d4af37", ink: "#111111", paper: "#f7f4ee", headFont: "Cormorant Garamond", bodyFont: "Montserrat", motif: "luxury", cover: "full", darkBody: true, upper: true, spacing: 6 }) },
  { id: "ivory-estate", name: "Ivory Estate", kind: "deck", category: "Luxury", description: "Light ivory, arched photos, quiet elegance.", recipe: DECK, theme: th({ primary: "#5b4636", secondary: "#e9dfd3", accent: "#b08d57", ink: "#2d241d", paper: "#fbf7f1", headFont: "DM Serif Display", bodyFont: "Lora", motif: "soft", cover: "arch", radius: 28 }) },
  { id: "skyline-penthouse", name: "Skyline Penthouse", kind: "deck", category: "Luxury", description: "Dark, cinematic, full-bleed views.", recipe: DECK, theme: th({ primary: "#0b1a2a", secondary: "#24415f", accent: "#7fb3d5", ink: "#0b1a2a", paper: "#f4f7fa", headFont: "Raleway", bodyFont: "Inter", motif: "photo", cover: "full", darkBody: true, upper: true, spacing: 8 }) },
  { id: "urban-condo", name: "Urban Condo", kind: "deck", category: "Condo", description: "Bold blocks and big type for city units.", recipe: DECK, theme: th({ primary: "#1d1d1f", secondary: "#e8e8e8", accent: "#c6f432", ink: "#1d1d1f", paper: "#ffffff", headFont: "Bebas Neue", bodyFont: "Inter", motif: "bold", cover: "block", upper: true, spacing: 2 }) },
  { id: "metro-living", name: "Metro Living", kind: "deck", category: "Condo", description: "Clean corporate blue for CBD condos.", recipe: DECK, theme: th({ primary: "#0f3b73", secondary: "#dbe7f5", accent: "#2f80ed", ink: "#10233d", paper: "#ffffff", headFont: "Montserrat", bodyFont: "Inter", motif: "corporate", cover: "split" }) },
  { id: "family-home", name: "Family Home", kind: "deck", category: "House & lot", description: "Warm terracotta, soft shapes, inviting.", recipe: DECK, theme: th({ primary: "#b5543c", secondary: "#f3d9c9", accent: "#e09f3e", ink: "#3b2620", paper: "#fffaf5", headFont: "Lora", bodyFont: "Poppins", motif: "soft", cover: "framed", radius: 24 }) },
  { id: "garden-villa", name: "Garden Villa", kind: "deck", category: "House & lot", description: "Leafy greens with editorial serif layouts.", recipe: DECK, theme: th({ primary: "#2f4f3a", secondary: "#dfe8d6", accent: "#a3b86c", ink: "#1f2b22", paper: "#fbfcf7", headFont: "Playfair Display", bodyFont: "Raleway", motif: "editorial", cover: "editorial", italic: true }) },
  { id: "modern-minimal", name: "Modern Minimal", kind: "deck", category: "Any", description: "Black on white, generous space, thin rules.", recipe: DECK, theme: th({ primary: "#111111", secondary: "#eeeeee", accent: "#111111", ink: "#111111", paper: "#ffffff", headFont: "Inter", bodyFont: "Inter", motif: "minimal", cover: "framed", upper: false, spacing: -1 }) },
  { id: "scandi-calm", name: "Scandi Calm", kind: "deck", category: "Any", description: "Warm greys and oak tones, rounded photos.", recipe: DECK, theme: th({ primary: "#6b6259", secondary: "#e7e1d9", accent: "#c19a6b", ink: "#2e2a26", paper: "#f8f6f3", headFont: "Raleway", bodyFont: "Inter", motif: "minimal", cover: "arch", radius: 32 }) },
  { id: "investor-brief", name: "Investor Brief", kind: "deck", category: "Investment", description: "Numbers first: facts, price and terms up front.", recipe: ["cover", "overview", "pricing", "highlights", "location", "amenities", "gallery", "contact"], theme: th({ primary: "#1b2a41", secondary: "#e3e8ef", accent: "#16a085", ink: "#1b2a41", paper: "#ffffff", headFont: "Montserrat", bodyFont: "Inter", motif: "corporate", cover: "split" }) },
  { id: "commercial-prime", name: "Commercial Prime", kind: "deck", category: "Commercial", description: "Navy and orange for offices and retail.", recipe: LAND, theme: th({ primary: "#13294b", secondary: "#e6ecf5", accent: "#f28c28", ink: "#13294b", paper: "#ffffff", headFont: "Oswald", bodyFont: "Inter", motif: "bold", cover: "block", upper: true, spacing: 1 }) },
  { id: "industrial-yard", name: "Industrial Yard", kind: "deck", category: "Industrial", description: "Graphite and safety yellow for warehouses.", recipe: LAND, theme: th({ primary: "#2b2d31", secondary: "#d9dadc", accent: "#f5c518", ink: "#1e1f22", paper: "#f5f5f4", headFont: "Bebas Neue", bodyFont: "Montserrat", motif: "bold", cover: "split", upper: true, spacing: 3, darkBody: true }) },
  { id: "land-bank", name: "Land Bank", kind: "deck", category: "Land", description: "Earth tones and wide photos for lots.", recipe: LAND, theme: th({ primary: "#5c4b37", secondary: "#ece3d4", accent: "#8f9b3a", ink: "#2f261c", paper: "#fbf8f2", headFont: "Libre Baskerville", bodyFont: "Raleway", motif: "editorial", cover: "editorial" }) },
  { id: "farm-ranch", name: "Farm & Ranch", kind: "deck", category: "Land", description: "Fresh greens and soft shapes for farm lots.", recipe: LAND, theme: th({ primary: "#3d6b35", secondary: "#e3efd9", accent: "#e2a03f", ink: "#25361f", paper: "#fbfdf7", headFont: "Lora", bodyFont: "Poppins", motif: "soft", cover: "framed", radius: 20 }) },
  { id: "resort-living", name: "Resort Living", kind: "deck", category: "Leisure", description: "Tropical teal and sand, big photos.", recipe: DECK, theme: th({ primary: "#0e5e6f", secondary: "#f2e6cf", accent: "#f2a65a", ink: "#123a42", paper: "#fffdf8", headFont: "DM Serif Display", bodyFont: "Poppins", motif: "photo", cover: "full", radius: 20 }) },
  { id: "preselling-launch", name: "Pre-Selling Launch", kind: "deck", category: "Pre-selling", description: "Vibrant geometric shapes for project launches.", recipe: DECK, theme: th({ primary: "#4b2bbf", secondary: "#e2dcff", accent: "#ff6b6b", ink: "#1f1640", paper: "#ffffff", headFont: "Montserrat", bodyFont: "Poppins", motif: "geometric", cover: "split", radius: 18 }) },
  { id: "rental-ready", name: "Rental Ready", kind: "deck", category: "Rental", description: "Friendly pastels for units for lease.", recipe: DECK_SHORT, theme: th({ primary: "#2a6f97", secondary: "#d6eaf5", accent: "#f4a259", ink: "#1b3040", paper: "#ffffff", headFont: "Poppins", bodyFont: "Poppins", motif: "soft", cover: "framed", radius: 26 }) },
  { id: "heritage", name: "Heritage", kind: "deck", category: "Classic", description: "Burgundy and cream with classic serif type.", recipe: DECK, theme: th({ primary: "#6d1f2c", secondary: "#f1e4dc", accent: "#c49a5a", ink: "#2c1418", paper: "#fbf6f0", headFont: "Cormorant Garamond", bodyFont: "Lora", motif: "luxury", cover: "framed", italic: true }) },
  { id: "coastal-breeze", name: "Coastal Breeze", kind: "deck", category: "Leisure", description: "Sea blues and white, airy and light.", recipe: DECK, theme: th({ primary: "#1f6f8b", secondary: "#d7eef2", accent: "#99c1b9", ink: "#173b47", paper: "#fbfeff", headFont: "Raleway", bodyFont: "Inter", motif: "geometric", cover: "arch", radius: 30, upper: true, spacing: 4 }) },

  // ---- 10 teaser trailers
  { id: "cinematic-reveal", name: "Cinematic Reveal", kind: "trailer", category: "Landscape 16:9", description: "Letterboxed, slow zooms, serif titles.", recipe: TRAILER, letterbox: true, pace: 3.6, theme: th({ primary: "#0c0c0c", secondary: "#2a2a2a", accent: "#e2b985", ink: "#0c0c0c", paper: "#f5f1ea", headFont: "Playfair Display", bodyFont: "Montserrat", motif: "luxury", cover: "full", darkBody: true, upper: true, spacing: 6 }) },
  { id: "luxury-glide", name: "Luxury Glide", kind: "trailer", category: "Landscape 16:9", description: "Gold accents and gentle fades.", recipe: TRAILER, pace: 3.4, theme: th({ primary: "#1a1a2e", secondary: "#3b3b58", accent: "#d4af37", ink: "#1a1a2e", paper: "#f7f4ee", headFont: "Cormorant Garamond", bodyFont: "Raleway", motif: "luxury", cover: "full", darkBody: true, italic: true }) },
  { id: "quick-tour-reel", name: "Quick Tour Reel", kind: "trailer", category: "Vertical 9:16", vertical: true, description: "Fast cuts and bold captions for Reels and TikTok.", recipe: REEL, pace: 2.4, theme: th({ primary: "#111111", secondary: "#2b2b2b", accent: "#ffde59", ink: "#111111", paper: "#ffffff", headFont: "Bebas Neue", bodyFont: "Montserrat", motif: "bold", cover: "full", upper: true, spacing: 2, darkBody: true }) },
  { id: "social-story", name: "Social Story", kind: "trailer", category: "Vertical 9:16", vertical: true, description: "Colourful, playful story for Stories and Messenger.", recipe: REEL, pace: 2.8, theme: th({ primary: "#ff5e78", secondary: "#ffe3e8", accent: "#ffd23f", ink: "#2b1d2f", paper: "#ffffff", headFont: "Poppins", bodyFont: "Poppins", motif: "geometric", cover: "arch", radius: 40 }) },
  { id: "just-listed", name: "Just Listed", kind: "trailer", category: "Landscape 16:9", description: "Bold stamp opener for new listings.", recipe: STAMP, stamp: "Just listed", pace: 3, theme: th({ primary: "#0f3b73", secondary: "#dbe7f5", accent: "#ffcc00", ink: "#0f1d33", paper: "#ffffff", headFont: "Oswald", bodyFont: "Inter", motif: "bold", cover: "block", upper: true, spacing: 2, darkBody: true }) },
  { id: "open-house", name: "Open House", kind: "trailer", category: "Vertical 9:16", vertical: true, description: "Invite viewers to an open house.", recipe: STAMP, stamp: "Open house", pace: 2.8, theme: th({ primary: "#2f4f3a", secondary: "#dfe8d6", accent: "#f2c14e", ink: "#1f2b22", paper: "#fbfcf7", headFont: "Montserrat", bodyFont: "Poppins", motif: "soft", cover: "framed", radius: 24, upper: true, spacing: 1, darkBody: true }) },
  { id: "price-drop", name: "Price Drop", kind: "trailer", category: "Landscape 16:9", description: "Urgent red and white for new prices.", recipe: STAMP, stamp: "New price", pace: 2.8, theme: th({ primary: "#b3001b", secondary: "#ffe5e8", accent: "#ffffff", ink: "#1a0a0d", paper: "#ffffff", headFont: "Bebas Neue", bodyFont: "Inter", motif: "bold", cover: "full", upper: true, spacing: 3, darkBody: true }) },
  { id: "investor-pitch", name: "Investor Pitch", kind: "trailer", category: "Landscape 16:9", description: "Facts and figures on clean slides.", recipe: ["scene-title", "scene-facts", "scene-highlight", "scene-highlight", "scene-highlight", "scene-amenities", "scene-cta"], pace: 3.4, theme: th({ primary: "#1b2a41", secondary: "#e3e8ef", accent: "#16a085", ink: "#1b2a41", paper: "#ffffff", headFont: "Montserrat", bodyFont: "Inter", motif: "corporate", cover: "split", darkBody: true }) },
  { id: "lifestyle-montage", name: "Lifestyle Montage", kind: "trailer", category: "Vertical 9:16", vertical: true, description: "Script accents over a photo montage.", recipe: ["scene-hook", "scene-photo", "scene-highlight", "scene-photo", "scene-highlight", "scene-title", "scene-cta"], pace: 3, theme: th({ primary: "#3c2f2f", secondary: "#f3e9dc", accent: "#e6b89c", ink: "#2a201f", paper: "#fffaf3", headFont: "Great Vibes", bodyFont: "Raleway", motif: "photo", cover: "full", darkBody: true }) },
  { id: "minimal-fade", name: "Minimal Fade", kind: "trailer", category: "Landscape 16:9", description: "White space and soft fades.", recipe: TRAILER, pace: 3.2, theme: th({ primary: "#111111", secondary: "#efefef", accent: "#9a8c7a", ink: "#111111", paper: "#ffffff", headFont: "Inter", bodyFont: "Inter", motif: "minimal", cover: "framed", spacing: -1 }) },
];

export const DECK_TEMPLATES = TEMPLATES.filter((t) => t.kind === "deck");
export const TRAILER_TEMPLATES = TEMPLATES.filter((t) => t.kind === "trailer");
export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);

export function brandFrom(t: Template, logo: string | null = null): Brand {
  const x = t.theme;
  return { logo, primary: x.primary, secondary: x.secondary, accent: x.accent, ink: x.ink, paper: x.paper, headFont: x.headFont, bodyFont: x.bodyFont };
}

/** Builds a template's slides for a document's details. */
export function buildSlides(t: Template, doc: TeaserDoc): Slide[] {
  const c: Ctx = { W: doc.width, H: doc.height, P: doc.height > doc.width, th: t.theme, trailer: t.kind === "trailer", tpl: t };
  let hi = 0;
  let ph = 2;
  const out: Slide[] = [];
  for (const r of t.recipe) {
    switch (r) {
      case "cover":
      case "scene-hook":
        out.push(cover(c));
        break;
      case "overview":
        out.push(overview(c, doc));
        break;
      case "description":
        out.push(description(c));
        break;
      case "highlights":
        out.push(highlights(c, doc));
        break;
      case "amenities":
      case "scene-amenities": {
        const s = amenities(c, doc);
        out.push(c.trailer ? { ...s, bg: "$primary", ...regen(s, doc, true) } : s);
        break;
      }
      case "gallery":
        out.push(gallery(c, doc));
        break;
      case "location":
        out.push(location(c, doc));
        break;
      case "pricing":
        out.push(pricing(c));
        break;
      case "contact":
        out.push(contact(c));
        break;
      case "scene-title":
        out.push(sceneTitle(c));
        break;
      case "scene-facts":
        out.push(sceneFacts(c, doc));
        break;
      case "scene-highlight":
        out.push(sceneHighlight(c, hi++));
        break;
      case "scene-photo":
        out.push(scenePhoto(c, ph++));
        break;
      case "scene-stamp":
        out.push(sceneStamp(c));
        break;
      case "scene-cta":
        out.push(sceneCta(c));
        break;
      default:
        break;
    }
  }
  return out;
}

/** Trailer amenity scenes sit on the brand colour, so their generated items switch to light text. */
function regen(s: Slide, doc: TeaserDoc, dark: boolean): Partial<Slide> {
  if (!s.gen) return {};
  const gen: Gen = { ...s.gen, style: { ...s.gen.style, dark } };
  const heads = s.elements.filter((e) => !e.auto).map((e) => (e.type === "text" && e.color === "$ink" ? { ...e, color: "$paper" } : e));
  return { gen, elements: [...heads, ...generate(gen, doc)] };
}

export function sizeFor(t: Template) {
  return t.vertical ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

/** A new document from a template (keeps any details and logo passed in). */
export function newDoc(t: Template, base?: Partial<Pick<TeaserDoc, "property" | "agent" | "brand">>): TeaserDoc {
  const size = sizeFor(t);
  const doc: TeaserDoc = {
    v: 1,
    kind: t.kind,
    templateId: t.id,
    ...size,
    brand: base?.brand ?? brandFrom(t),
    property: base?.property ?? emptyProperty(),
    agent: base?.agent ?? emptyAgent(),
    slides: [],
  };
  doc.slides = buildSlides(t, doc);
  return doc;
}
