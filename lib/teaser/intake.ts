/**
 * Deal Desk → Property Teaser intake (no AI): free text in, a corrected, editable sheet out.
 *  understand(): spelling fixes, facts, description, highlights, amenities, terms and contact details.
 *  toRows() / fromRows(): the sheet the person checks and edits before choosing PowerPoint, Excel or the editor.
 */
import { AMENITIES, amenityInfo, findAmenities } from "./amenities";
import { writeCopy } from "./copy";
import { spellCorrect, type Correction } from "./spell";
import { emptyAgent, emptyProperty, type AgentDetails, type PropertyDetails } from "./types";

export type SectionId = "photos" | "logo" | "details" | "features" | "price" | "contact";
export const SECTIONS: { id: SectionId; label: string; hint: string; placeholder?: string }[] = [
  { id: "photos", label: "Photos", hint: "Drop or choose pictures; the first is the cover" },
  { id: "logo", label: "Logo", hint: "Your company or project logo" },
  { id: "details", label: "Property details", hint: "Name, type, location, size, rooms", placeholder: "e.g. Verde Residences, 2BR condo in Alabang, 68 sqm, 2 baths, 1 parking, fully furnished, high floor with lake view" },
  { id: "features", label: "Features & amenities", hint: "What makes it special, what's nearby", placeholder: "e.g. swimming pool, gym, 24/7 security, near Festival Mall, 5 minutes to SLEX" },
  { id: "price", label: "Price & terms", hint: "Price, down payment, financing", placeholder: "e.g. ₱8.5M, 20% down payment over 24 months, bank financing" },
  { id: "contact", label: "Contact", hint: "Your name, phone, email, company, PRC number", placeholder: "e.g. Ana Cruz, Licensed Broker, 0917 123 4567, ana@realty.ph, Cruz Realty, PRC 0012345" },
];

export type Sections = Partial<Record<SectionId | "all", string>>;

export interface Understood {
  property: PropertyDetails;
  agent: AgentDetails;
  corrections: Correction[];
  /** Plain notes: what was taken out of the description (phones, links) or could not be found. */
  notes: string[];
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE = /(?:\+?63[\s-]?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b|\(0?\d{1,3}\)\s?\d{3,4}[\s-]?\d{4}\b/;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s,;]+/i;
const LICENSE = /\bPRC(?:\s*(?:Lic(?:ense)?|Reg(?:istration)?)\.?)?(?:\s*No\.?)?\s*[:#]?\s*(\d{4,8})\b/i;
const COMPANY = /\b([A-Z][\w&.'-]*(?:\s+[A-Z&][\w&.'-]*){0,4}\s+(?:Realty|Realtors|Properties|Property|Real Estate|Land|Homes|Development|Developers|Brokerage|Inc\.?|Corp\.?|Corporation|Co\.))\b/;
const TITLE = /\b(licensed real estate (?:broker|salesperson)|real estate (?:broker|agent|salesperson)|property (?:specialist|consultant|manager)|(?:sales|property) agent|broker|salesperson|agent)\b/i;
const TERMS = /\b(down ?payment|\bdp\b|reservation|reserve|monthly|amortization|installment|bank financing|pag-?ibig|in-?house|spot cash|cash payment|equity|terms?|discount|rfo|ready for occupancy|turnover)\b/i;
const NEAR = /\b(?:near|beside|across(?: from)?|walking distance to|minutes? (?:away )?(?:from|to)|close to|next to)\s+([^.,;\n]{3,48})/gi;

const titleCase = (s: string) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
const tidy = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "").trim();

/** "Label: value" lines, so pasted forms are read exactly. */
function labelled(text: string) {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z /&.]{1,24})\s*[:=]\s*(.+)$/);
    if (m) out[m[1]!.trim().toLowerCase()] = m[2]!.trim();
  }
  return out;
}
const pick = (l: Record<string, string>, ...keys: string[]) => keys.map((k) => l[k]).find((v) => v && v.trim()) ?? "";

/** Contact details anywhere in the text. Only what the person typed; nothing is looked up. */
export function extractContact(text: string): AgentDetails {
  const a = emptyAgent();
  const l = labelled(text);
  a.email = pick(l, "email", "e-mail") || (text.match(EMAIL)?.[0] ?? "");
  a.phone = tidy(pick(l, "phone", "mobile", "cell", "tel", "contact no", "contact number", "viber") || (text.match(PHONE)?.[0] ?? ""));
  a.license = text.match(LICENSE)?.[1] ?? pick(l, "prc", "prc no", "license", "prc license");
  a.website = pick(l, "website", "web", "site") || (text.match(URL_RE)?.[0] ?? "");
  a.company = pick(l, "company", "brokerage", "agency", "realty") || ([...text.matchAll(new RegExp(COMPANY, "g"))].map((m) => m[1]!).find((x) => !/^licensed\b/i.test(x) && !TITLE.test(x.replace(/\b(real estate|properties|property)\b/gi, ""))) ?? "");
  a.title = titleCase(pick(l, "title", "position", "role") || (text.match(TITLE)?.[1] ?? ""));
  let name = pick(l, "name", "agent", "broker", "contact", "contact person", "agent name");
  if (!name) {
    // "Contact Ana Cruz", "Call Ana Cruz at…", or a line that is only a person's name.
    const m = text.match(/\b(?:[Cc]ontact|[Cc]all|[Tt]ext|[Mm]essage|[Vv]iber|[Aa]sk for|[Aa]gent|[Bb]roker)\s*:?\s+([A-Z][a-zñ]+(?:\s+(?:[A-Z]\.|[A-Z][a-zñ]+|de|dela|del|de la)){1,3})/);
    if (m) name = m[1]!;
    else
      for (const line of text.split(/[\n,]/)) {
        const t = line.trim();
        if (/^[A-Z][a-zñ]+(?:\s+(?:[A-Z]\.|[A-Z][a-zñ]+|de|dela|del)){1,3}$/.test(t) && !COMPANY.test(t) && !TITLE.test(t)) {
          name = t;
          break;
        }
      }
  }
  a.name = tidy(name.replace(EMAIL, "").replace(PHONE, ""));
  if (a.company && a.name === a.company) a.name = "";
  return a;
}

/** A property name: a "Name:" line, or a short first line that reads like a title. */
function nameFrom(text: string, l: Record<string, string>) {
  const v = pick(l, "name", "property", "property name", "project", "building", "title");
  if (v) return tidy(v);
  const first = text.split("\n").map((x) => x.trim()).find(Boolean) ?? "";
  const head = first.split(/[,.–—|]| - |\s+(?:in|at|along|near)\s+/)[0]!.trim();
  if (head && head.split(/\s+/).length <= 6 && !/\d\s*(sqm|br|bedroom)|₱|php|\bfor (sale|rent|lease)\b/i.test(head) && /^[A-Z0-9]/.test(head)) return head;
  return "";
}

export function understand(sec: Sections, base?: { property?: Partial<PropertyDetails>; agent?: Partial<AgentDetails> }): Understood {
  const contactRaw = [sec.contact, sec.all].filter(Boolean).join("\n");
  const propRaw = [sec.details, sec.features, sec.price, sec.all].filter((x) => x && x.trim()).join("\n");
  const notes: string[] = [];

  // Spelling first, so the summarizer, amenities and places all see the corrected words.
  // Contact text is left as typed (names, emails).
  const { text: fixed, corrections } = spellCorrect(propRaw);
  const l = labelled(fixed);
  const c = writeCopy(fixed, {}, 0);
  // The description and highlights leave out payment terms and labelled lists (shown on their own slides).
  const descSrc = fixed
    .split("\n")
    .filter((x) => !/^\s*(price|terms|payment|amenities|features|contact|agent|email|phone)\s*:/i.test(x))
    .join("\n")
    .split(/(?<=[.!?])\s+/)
    .filter((x) => !TERMS.test(x))
    .join(" ");
  const d = writeCopy(descSrc, {}, 0);
  const p: PropertyDetails = { ...emptyProperty(), ...base?.property };
  p.name = nameFrom(fixed, l) || p.name;
  p.tagline = c.taglines[0] ?? p.tagline;
  p.description = d.short || c.short || p.description;
  p.highlights = d.highlights.length ? d.highlights.slice(0, 8) : c.highlights.length ? c.highlights.slice(0, 8) : p.highlights;
  p.amenities = [...new Set([...p.amenities, ...c.amenities])];
  const f = c.facts;
  if (f.transaction) p.transaction = f.transaction;
  if (f.kind) p.kind = f.kind;
  if (f.price) p.price = f.price;
  if (f.bedrooms !== undefined) p.bedrooms = f.bedrooms;
  if (f.bathrooms) p.bathrooms = f.bathrooms;
  if (f.floorArea) p.floorArea = f.floorArea;
  if (f.lotArea) p.lotArea = f.lotArea;
  if (f.parking) p.parking = f.parking;
  if (f.city) p.city = f.city;
  p.location = tidy(pick(l, "location", "address", "where")) || f.location || p.location;

  // Terms: the price section's sentences about payment, or any such sentence.
  const termSrc = sec.price ? spellCorrect(sec.price).text : fixed;
  const terms = termSrc
    .split(/(?<=[.!?])\s+|\n/)
    .map((x) => tidy(x))
    .filter((x) => x && TERMS.test(x) && !/^(contact|call|email)/i.test(x));
  p.paymentTerms = tidy(pick(l, "terms", "payment terms", "payment")) || terms.slice(0, 3).join(". ") || p.paymentTerms;

  const near = [...fixed.matchAll(NEAR)].map((m) => tidy(m[1]!)).filter((x) => x.length >= 3);
  p.nearby = [...new Set([...p.nearby, ...near])].slice(0, 6);

  const agent = { ...emptyAgent(), ...base?.agent };
  const found = extractContact(contactRaw);
  for (const k of Object.keys(found) as (keyof AgentDetails)[]) if (found[k]) agent[k] = found[k];

  if (c.removed.length) notes.push(`Kept out of the description: ${c.removed.join(", ")}.`);
  const missing = [!p.name && "property name", !p.price && !p.priceNote && "price", !p.location && !p.city && "location", !agent.phone && !agent.email && "contact"].filter(Boolean);
  if (missing.length) notes.push(`Not found: ${missing.join(", ")}. Fill them in the sheet.`);
  return { property: p, agent, corrections, notes };
}

// ---------------------------------------------------------------- the sheet

export interface Row {
  key: string;
  label: string;
  value: string;
  /** Long text: shown as a text area. */
  long?: boolean;
  group: "Property" | "Selling points" | "Price" | "Contact";
}

const n = (v: number | null) => (v === null || v === undefined ? "" : String(v));
export function toRows(p: PropertyDetails, a: AgentDetails): Row[] {
  return [
    { group: "Property", key: "name", label: "Property name", value: p.name },
    { group: "Property", key: "tagline", label: "Tagline", value: p.tagline },
    { group: "Property", key: "transaction", label: "For", value: p.transaction === "lease" ? "Lease" : "Sale" },
    { group: "Property", key: "kind", label: "Type", value: p.kind },
    { group: "Property", key: "location", label: "Location", value: p.location },
    { group: "Property", key: "city", label: "City", value: p.city },
    { group: "Property", key: "bedrooms", label: "Bedrooms", value: p.bedrooms === 0 ? "Studio" : n(p.bedrooms) },
    { group: "Property", key: "bathrooms", label: "Bathrooms", value: n(p.bathrooms) },
    { group: "Property", key: "floorArea", label: "Floor area (sqm)", value: n(p.floorArea) },
    { group: "Property", key: "lotArea", label: "Lot area (sqm)", value: n(p.lotArea) },
    { group: "Property", key: "parking", label: "Parking", value: n(p.parking) },
    { group: "Selling points", key: "description", label: "Description", value: p.description, long: true },
    { group: "Selling points", key: "highlights", label: "Highlights (one per line)", value: p.highlights.join("\n"), long: true },
    { group: "Selling points", key: "amenities", label: "Amenities (comma separated)", value: p.amenities.map((x) => amenityInfo(x).label).join(", "), long: true },
    { group: "Selling points", key: "nearby", label: "Nearby (one per line)", value: p.nearby.join("\n"), long: true },
    { group: "Price", key: "price", label: "Price (₱)", value: n(p.price) },
    { group: "Price", key: "priceNote", label: "Price wording (optional)", value: p.priceNote },
    { group: "Price", key: "paymentTerms", label: "Payment terms", value: p.paymentTerms, long: true },
    { group: "Contact", key: "agent.name", label: "Name", value: a.name },
    { group: "Contact", key: "agent.title", label: "Title", value: a.title },
    { group: "Contact", key: "agent.phone", label: "Phone", value: a.phone },
    { group: "Contact", key: "agent.email", label: "Email", value: a.email },
    { group: "Contact", key: "agent.company", label: "Company", value: a.company },
    { group: "Contact", key: "agent.license", label: "PRC license no.", value: a.license },
    { group: "Contact", key: "agent.website", label: "Website", value: a.website },
  ];
}

const num = (s: string) => {
  const t = s.replace(/[₱,\s]|php/gi, "");
  const m = t.match(/^(\d+(?:\.\d+)?)(m|k)?$/i);
  if (!m) return null;
  const v = Number(m[1]) * (m[2]?.toLowerCase() === "m" ? 1e6 : m[2]?.toLowerCase() === "k" ? 1e3 : 1);
  return Number.isFinite(v) ? Math.round(v) : null;
};
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function fromRows(rows: Row[], base: PropertyDetails): { property: PropertyDetails; agent: AgentDetails } {
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value.trim()]));
  const amenities = (v.amenities ?? "")
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => AMENITIES.find((a) => a.label.toLowerCase() === x.toLowerCase())?.id ?? findAmenities(x)[0] ?? `custom:${x}`);
  const property: PropertyDetails = {
    ...base,
    name: v.name ?? "",
    tagline: v.tagline ?? "",
    transaction: /lease|rent/i.test(v.transaction ?? "") ? "lease" : "sale",
    kind: v.kind ?? "",
    location: v.location ?? "",
    city: v.city ?? "",
    bedrooms: /studio/i.test(v.bedrooms ?? "") ? 0 : num(v.bedrooms ?? ""),
    bathrooms: num(v.bathrooms ?? ""),
    floorArea: num(v.floorArea ?? ""),
    lotArea: num(v.lotArea ?? ""),
    parking: num(v.parking ?? ""),
    description: v.description ?? "",
    highlights: lines(v.highlights ?? "").slice(0, 8),
    amenities: [...new Set(amenities)].slice(0, 24),
    nearby: lines(v.nearby ?? "").slice(0, 6),
    price: num(v.price ?? ""),
    priceNote: v.priceNote ?? "",
    paymentTerms: v.paymentTerms ?? "",
  };
  const agent: AgentDetails = { name: v["agent.name"] ?? "", title: v["agent.title"] ?? "", phone: v["agent.phone"] ?? "", email: v["agent.email"] ?? "", company: v["agent.company"] ?? "", license: v["agent.license"] ?? "", website: v["agent.website"] ?? "" };
  return { property, agent };
}

/** The sheet as spreadsheet rows (Excel output). */
export function sheetTable(rows: Row[], photos: number) {
  return [["Section", "Field", "Value"], ...rows.map((r) => [r.group, r.label.replace(/ \((one per line|comma separated|optional)\)/, ""), r.value]), ["Photos", "Photos added", photos ? String(photos) : ""]];
}
