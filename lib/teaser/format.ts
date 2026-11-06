/**
 * Brand tokens and detail bindings.
 * Colours may be tokens ("$primary", "$accent/40" = 40% opacity) and fonts "$head" / "$body", so changing the
 * brand recolours the whole design. Bound elements ("property.price", "photo:0", "amenity:3") follow the details.
 */
import { amenityInfo } from "./amenities";
import type { Brand, El, PropertyDetails, TeaserDoc } from "./types";

const TOKENS = ["primary", "secondary", "accent", "ink", "paper"] as const;

/** "#abc", "#aabbcc", "#aabbccdd" or "$token[/alpha]" → CSS rgba()/hex usable by canvas and DOM. */
export function color(c: string | undefined, brand: Brand): string {
  if (!c) return "transparent";
  if (c.startsWith("$")) {
    const [tok, a] = c.slice(1).split("/");
    const hex = (TOKENS as readonly string[]).includes(tok!) ? (brand as unknown as Record<string, string>)[tok!]! : "#000000";
    return a === undefined ? hex : withAlpha(hex, Number(a) / 100);
  }
  return c;
}

export function withAlpha(hex: string, a: number) {
  const { r, g, b } = rgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

export function rgb(hex: string) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.replace(/./g, (x) => x + x);
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
}

/** Resolved colour as 6-digit hex + 0–1 alpha (for PowerPoint). */
export function hexAlpha(c: string | undefined, brand: Brand): { hex: string; alpha: number } {
  const v = color(c, brand);
  const m = v.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
  if (m) return { hex: [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join(""), alpha: Number(m[4]) };
  if (v === "transparent") return { hex: "000000", alpha: 0 };
  const { r, g, b, a } = rgb(v);
  return { hex: [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join(""), alpha: a };
}

export const font = (f: string, brand: Brand) => (f === "$head" ? brand.headFont : f === "$body" ? brand.bodyFont : f);

/** Readable text colour (ink or paper) for a background. */
export function contrastOn(bg: string, brand: Brand) {
  const { r, g, b } = rgb(color(bg, brand).startsWith("rgba") ? "#000000" : color(bg, brand));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? brand.ink : "#ffffff";
}

// ---- values from the details ----

export function priceText(p: PropertyDetails) {
  if (p.priceNote.trim()) return p.priceNote.trim();
  if (!p.price) return "";
  const v = p.price;
  const s = v >= 1_000_000 ? `₱${+(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)}M` : `₱${v.toLocaleString("en-PH")}`;
  return p.transaction === "lease" ? `${s} / month` : s;
}

export function factsText(p: PropertyDetails) {
  return [
    p.bedrooms === 0 ? "Studio" : p.bedrooms ? `${p.bedrooms} Bedroom${p.bedrooms === 1 ? "" : "s"}` : "",
    p.bathrooms ? `${p.bathrooms} Bath${p.bathrooms === 1 ? "" : "s"}` : "",
    p.floorArea ? `${p.floorArea.toLocaleString()} sqm` : "",
    p.lotArea ? `${p.lotArea.toLocaleString()} sqm lot` : "",
    p.parking ? `${p.parking} Parking` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
}

/** Placeholder shown while a detail is empty, so templates look complete in the editor. */
const HINT: Record<string, string> = {
  "property.name": "Property name",
  "property.tagline": "A short line that sells it",
  "property.price": "₱ Price",
  "property.location": "Location",
  "property.description": "Describe the property in a few sentences. Use Details → Write it for me to summarize your notes.",
  "property.kind": "Property type",
  "property.facts": "Bedrooms · Baths · Floor area",
  "property.terms": "Payment terms",
  "agent.name": "Your name",
  "agent.title": "Licensed Real Estate Broker",
  "agent.phone": "+63 900 000 0000",
  "agent.email": "you@company.com",
  "agent.contact": "+63 900 000 0000  ·  you@company.com",
  "agent.company": "Company",
};

/** Text for a binding, or null when the binding is not text. `placeholders` fills empty details with hints. */
export function boundText(bind: string, doc: TeaserDoc, placeholders = true): string | null {
  const p = doc.property;
  const a = doc.agent;
  const hint = (k: string, v: string) => (v ? v : placeholders ? (HINT[k] ?? "") : "");
  const [k, i] = bind.split(":") as [string, string | undefined];
  switch (k) {
    case "property.name":
      return hint(k, p.name);
    case "property.tagline":
      return hint(k, p.tagline);
    case "property.price":
      return hint(k, priceText(p));
    case "property.location":
      return hint(k, p.location || p.city);
    case "property.description":
      return hint(k, p.description);
    case "property.kind":
      return hint(k, p.kind);
    case "property.transaction":
      return p.transaction === "lease" ? "For Lease" : "For Sale";
    case "property.facts":
      return hint(k, factsText(p));
    case "property.beds":
      return p.bedrooms === 0 ? "Studio" : p.bedrooms ? String(p.bedrooms) : placeholders ? "—" : "";
    case "property.baths":
      return p.bathrooms ? String(p.bathrooms) : placeholders ? "—" : "";
    case "property.floor":
      return p.floorArea ? `${p.floorArea.toLocaleString()} sqm` : placeholders ? "— sqm" : "";
    case "property.lot":
      return p.lotArea ? `${p.lotArea.toLocaleString()} sqm` : placeholders ? "— sqm" : "";
    case "property.floorN":
      return p.floorArea ? p.floorArea.toLocaleString() : placeholders ? "—" : "";
    case "property.lotN":
      return p.lotArea ? p.lotArea.toLocaleString() : placeholders ? "—" : "";
    case "property.parking":
      return p.parking ? String(p.parking) : placeholders ? "—" : "";
    case "property.terms":
      return hint(k, p.paymentTerms);
    case "property.code":
      return p.listingCode ?? "";
    case "highlight":
      return p.highlights[Number(i)] ?? "";
    case "amenity":
      return p.amenities[Number(i)] ? amenityInfo(p.amenities[Number(i)]!).label : "";
    case "nearby":
      return p.nearby[Number(i)] ?? "";
    case "agent.name":
      return hint(k, a.name);
    case "agent.title":
      return hint(k, a.title);
    case "agent.phone":
      return hint(k, a.phone);
    case "agent.email":
      return hint(k, a.email);
    case "agent.license":
      return a.license ? `PRC License No. ${a.license}` : "";
    case "agent.company":
      return hint(k, a.company);
    case "agent.website":
      return a.website;
    case "agent.contact":
      return hint(k, [a.phone, a.email].filter(Boolean).join("  ·  "));
    default:
      return null;
  }
}

/** Image source for a binding (brand logo, property photos). */
export function boundImage(bind: string, doc: TeaserDoc): string | null | undefined {
  if (bind === "brand.logo") return doc.brand.logo;
  if (bind.startsWith("photo:")) return doc.property.photos[Number(bind.slice(6))] ?? null;
  return undefined;
}

/** Icon name for a binding (amenityIcon:3). */
export function boundIcon(bind: string, doc: TeaserDoc): string | undefined {
  if (bind.startsWith("amenityIcon:")) {
    const id = doc.property.amenities[Number(bind.slice(12))];
    return id ? amenityInfo(id).icon : undefined;
  }
  return undefined;
}

/** The element as it should be drawn now: bound values filled in, upper-casing applied. */
export function liveEl(el: El, doc: TeaserDoc, placeholders = true): El {
  if (!el.bind) return el;
  if (el.type === "text") {
    const t = boundText(el.bind, doc, placeholders);
    return t === null ? el : { ...el, text: t };
  }
  if (el.type === "image") {
    const s = boundImage(el.bind, doc);
    return s === undefined ? el : { ...el, src: s };
  }
  if (el.type === "icon") {
    const ic = boundIcon(el.bind, doc);
    return ic ? { ...el, icon: ic } : el;
  }
  return el;
}

export const isEmptyBound = (el: El, doc: TeaserDoc) => el.bind !== undefined && el.type === "text" && boundText(el.bind, doc, false) === "";
