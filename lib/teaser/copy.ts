/**
 * No-AI copywriter for Property Teaser. Turns a user's raw notes or listing text into:
 *  - taglines (template-based, several to cycle through)
 *  - a short description (≤ 60 words) and a long one (≤ 120 words), extractive: the most central sentences
 *  - highlights (short bullet phrases), amenities (ids) and facts (bedrooms, areas, parking, price, place)
 * It cleans the text first: emojis, phone numbers, emails, links, hashtags, "PM for details", ALL-CAPS shouting.
 * Pure functions; runs in the browser and on the server.
 */
import { KINDS, kindFromText } from "@/lib/listings/kinds";
import { parseBedrooms } from "@/lib/listings/normalize";
import { resolvePlaceFuzzy } from "@/lib/listings/places";
import { sentences, summarize } from "@/lib/engine/text";
import { amenityInfo, findAmenities } from "./amenities";
import type { PropertyDetails } from "./types";

export interface CopyResult {
  taglines: string[];
  short: string;
  long: string;
  highlights: string[];
  amenities: string[];
  facts: Partial<Pick<PropertyDetails, "bedrooms" | "bathrooms" | "floorArea" | "lotArea" | "parking" | "price" | "city" | "kind" | "transaction" | "location">>;
  /** What was removed while cleaning, so the user knows (e.g. "2 phone numbers"). */
  removed: string[];
}

const PHONE = /(?:\+?63|0)\s?9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b|\(\d{2,3}\)\s?\d{3,4}[\s-]?\d{4}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const CTA = /\b(pm|dm|message|text|call|contact|inquire|viber|whatsapp)\b[^.!?\n]{0,40}\b(me|us|now|for (?:more )?(?:details|info|inquiries|viewing))\b[.!]?/gi;

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const capWords = (s: string, n: number) => {
  const w = words(s);
  return w.length <= n ? s : `${w.slice(0, n).join(" ").replace(/[,;:]$/, "")}…`;
};
const titleCase = (s: string) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
const sentenceCase = (s: string) => s.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g, (_, a, b: string) => a + b.toUpperCase()).replace(/\b(\d+)br\b/g, "$1BR").replace(/\b(bgc|qc|ncr|mrt|lrt|tct|cct|sqm|php|slex|nlex|edsa|c5|rfo|ff)\b/g, (m) => (m === "sqm" ? m : m.toUpperCase()));

export function cleanText(raw: string) {
  const removed: string[] = [];
  const count = (re: RegExp, label: string, s: string) => {
    const n = (s.match(re) ?? []).length;
    if (n) removed.push(`${n} ${label}${n === 1 ? "" : "s"}`);
  };
  count(PHONE, "phone number", raw);
  count(EMAIL, "email address", raw);
  count(URL_RE, "link", raw);
  let t = raw
    .replace(URL_RE, " ")
    .replace(EMAIL, " ")
    .replace(PHONE, " ")
    .replace(CTA, " ")
    .replace(/\b(call|text|viber|whatsapp|pm|dm|contact)(\s+(me|us|now))?\s*[.:!]?[ \t]*$/gim, "")
    .replace(/#\w+/g, " ")
    .replace(/\p{Extended_Pictographic}|️|‍/gu, " ")
    .replace(/[✓✔•●▪►➡→★☆]/g, "\n- ")
    .replace(/([!?.])\1+/g, "$1")
    .replace(/[ \t]+/g, " ");
  // Shouting: a line that is mostly capitals becomes sentence case (place names keep their capitals).
  // A line without an end mark (a heading) gets a full stop so it does not run into the next sentence.
  t = t
    .split("\n")
    .map((line) => {
      const letters = line.replace(/[^a-zA-Z]/g, "");
      void letters;
      // Per sentence, so one shouted headline in a normal paragraph is fixed on its own.
      let l = line
        .split(/(?<=[.!?])\s+/)
        .map((sent) => {
          const ls = sent.replace(/[^a-zA-Z]/g, "");
          if (ls.length <= 8 || ls.replace(/[^A-Z]/g, "").length / ls.length <= 0.7) return sent;
          let out = sentenceCase(sent);
          for (const m of resolvePlaceFuzzy(sent).matched ?? []) out = out.replace(new RegExp(`\\b${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), titleCase(m));
          return out;
        })
        .join(" ");
      l = l.trim();
      return l && !/^-\s/.test(l) && /[a-z0-9)]$/i.test(l) ? `${l}.` : l;
    })
    .join("\n")
    .replace(/\n\s*-\s*\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: t, removed };
}

function num(s: string) {
  return Number(s.replace(/,/g, ""));
}

export function extractFacts(text: string): CopyResult["facts"] {
  const t = text.toLowerCase();
  const f: CopyResult["facts"] = {};
  const beds = parseBedrooms(text);
  if (beds !== null) f.bedrooms = beds;
  const baths = t.match(/(\d{1,2})\s*(?:t&b|t & b|baths?|bathrooms?|toilets? and baths?|cr)\b/);
  if (baths) f.bathrooms = Number(baths[1]);
  const lot = t.match(/(?:lot(?: area)?|land(?: area)?|la)\s*(?:of|:|-)?\s*(\d[\d,]*(?:\.\d+)?)\s*(sqm|sq\.?\s*m|m2|hectares?|has?\b)/) ?? t.match(/(\d[\d,]*(?:\.\d+)?)\s*(sqm|sq\.?\s*m|m2|hectares?)\s*(?:lot|land)/);
  if (lot) f.lotArea = /hect|ha/.test(lot[2]!) ? Math.round(num(lot[1]!) * 10_000) : num(lot[1]!);
  const floor = t.match(/(?:floor(?: area)?|fa|unit(?: size)?|living area)\s*(?:of|:|-)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:sqm|sq\.?\s*m|m2)/) ?? t.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:sqm|sq\.?\s*m|m2)\s*(?:floor|fa|unit|living)/);
  if (floor) f.floorArea = num(floor[1]!);
  if (!f.floorArea && !f.lotArea) {
    const any = t.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:sqm|sq\.?\s*m|m2)/);
    if (any && /(lot|land|farm|hectare)/.test(t)) f.lotArea = num(any[1]!);
    else if (any) f.floorArea = num(any[1]!);
  }
  const park = t.match(/(\d)\s*(?:-?car garage|parking(?: slots?)?|car park|slots? of parking)/) ?? (/(with|w\/)\s*parking/.test(t) ? ["", "1"] : null);
  if (park) f.parking = Number(park[1]);
  const price = t.match(/(?:₱|php|p)\s?(\d[\d,]*(?:\.\d+)?)\s*(m(?:illion)?|k)?\b/) ?? t.match(/(\d+(?:\.\d+)?)\s*(m(?:illion)?)\b(?!\s*(?:sqm|away))/);
  if (price) {
    const u = (price[2] ?? "").toLowerCase();
    const v = num(price[1]!) * (u.startsWith("m") ? 1e6 : u === "k" ? 1e3 : 1);
    if (v >= 1000) f.price = Math.round(v);
  }
  if (/\b(for rent|for lease|per month|\/mo|monthly rent|rental)\b/.test(t)) f.transaction = "lease";
  else if (/\b(for sale|selling|sale)\b/.test(t)) f.transaction = "sale";
  const kind = kindFromText(text);
  if (kind) f.kind = KINDS[kind]!.label;
  const place = resolvePlaceFuzzy(text);
  if (place.city) f.city = place.city;
  return f;
}

/** The place as the user wrote it ("Alabang"), falling back to the city. */
export function placeWord(text: string) {
  const p = resolvePlaceFuzzy(text);
  const m = p.matched?.find((x) => x.length > 2 && !/^(metro manila|ncr)$/.test(x));
  return m ? titleCase(m) : p.city ?? "";
}

/** Short bullet phrases: the user's own bullet lines first, then clauses that name a feature or a number. */
function highlightsFrom(clean: string, amenities: string[], facts: CopyResult["facts"]) {
  const out: string[] = [];
  const push = (s: string) => {
    const x = s.replace(/^[-*\s]+/, "").replace(/[.;:,]+$/, "").trim();
    if (x.length < 4 || words(x).length > 9) return;
    const v = x[0]!.toUpperCase() + x.slice(1);
    if (!out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  };
  for (const line of clean.split("\n")) if (/^\s*-\s+/.test(line)) push(line);
  if (out.length < 6)
    for (const s of sentences(clean))
      for (const part of s.split(/,|;|\bwith\b|\band\b|\bplus\b/i)) {
        const p = part.trim();
        if (/\d|furnish|view|corner|pool|gym|garden|parking|near|walk|minutes|title|security|frontage|new|renovated/i.test(p)) push(p);
      }
  const factLine = [facts.bedrooms !== undefined ? (facts.bedrooms === 0 ? "Studio layout" : `${facts.bedrooms} bedrooms`) : "", facts.bathrooms ? `${facts.bathrooms} bathrooms` : "", facts.floorArea ? `${facts.floorArea.toLocaleString()} sqm floor area` : "", facts.lotArea ? `${facts.lotArea.toLocaleString()} sqm lot` : ""].filter(Boolean);
  for (const f of factLine) if (out.length < 6) push(f);
  for (const a of amenities) if (out.length < 6) push(amenityInfo(a).label);
  return out.slice(0, 6);
}

const ADJ: Record<string, string> = { furnished: "Fully furnished", view: "View-filled", corner: "Corner", pool: "Resort-style", gated: "Exclusive", clean_title: "Titled", road_frontage: "Prime", beach: "Beachfront", income: "Income-ready", smart_home: "Smart", balcony: "Breezy" };

export function taglines(d: Partial<PropertyDetails>, amenities: string[], seed = 0): string[] {
  const kind = (d.kind || "home").toLowerCase().replace("condominium unit", "condo").replace("house and lot", "house");
  const place = d.location?.split(",")[0]?.trim() || d.city || "the city";
  const adj = amenities.map((a) => ADJ[a]).find(Boolean) ?? ["Prime", "Elegant", "Modern", "Spacious", "Stylish"][Math.abs(seed) % 5]!;
  const top = amenities.map((a) => amenityInfo(a).label.toLowerCase()).find((l) => !/near|title|zoning/.test(l));
  const rent = d.transaction === "lease";
  const beds = d.bedrooms ? `${d.bedrooms}-bedroom ` : d.bedrooms === 0 ? "studio " : "";
  const commercial = /lot|office|retail|warehouse|commercial|building|industrial|farm/.test(kind);
  const list = commercial
    ? [`${adj} ${kind} in ${place}`, `Room to grow in ${place}`, `Your next address for business in ${place}`, `A rare ${kind} opportunity in ${place}`, `Built for business: ${kind} in ${place}`]
    : [
        `${adj} ${beds}${kind} in ${place}`,
        `Your ${rent ? "next" : "new"} home in the heart of ${place}`,
        `${place} living, made easy`,
        top ? `${beds ? beds[0]!.toUpperCase() + beds.slice(1) : "A "}${kind} with ${top}` : `Come home to ${place}`,
        rent ? `Move in and feel at home in ${place}` : `Own a piece of ${place}`,
      ];
  return [...new Set(list.map((s) => s.replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase())))];
}

export function writeCopy(raw: string, known: Partial<PropertyDetails> = {}, seed = 0): CopyResult {
  const { text, removed } = cleanText(raw || "");
  const facts = extractFacts(text);
  const amenities = [...new Set([...(known.amenities ?? []), ...findAmenities(text)])];
  const word = placeWord(text);
  if (word) facts.location = word;
  const d = { ...facts, ...(word ? { location: word } : {}), ...Object.fromEntries(Object.entries(known).filter(([, v]) => v !== null && v !== "" && v !== undefined)) } as Partial<PropertyDetails>;
  const highlights = highlightsFrom(text, amenities, facts);
  const prose = text
    .split("\n")
    .filter((l) => !/^\s*-\s+/.test(l))
    .join("\n");
  // Price and contact lines are shown elsewhere in the design, so they stay out of the description.
  const story = sentences(prose)
    .filter((x) => !/^(price|selling price|asking|tcp|total contract price|contact|for inquiries|reservation|terms?)\b/i.test(x) && !/₱\s?\d|\bphp\s?\d/i.test(x))
    .join(" ");
  let short = summarize(story, 3).join(" ");
  let long = summarize(story, 6).join(" ");
  if (!short) {
    // Nothing to summarize: write from the facts.
    const kind = (d.kind || "property").toLowerCase();
    const where = d.location || d.city;
    const feat = amenities.slice(0, 3).map((a) => amenityInfo(a).label.toLowerCase());
    short = `${d.bedrooms ? `A ${d.bedrooms}-bedroom ${kind}` : `A ${kind}`}${where ? ` in ${where}` : ""}${feat.length ? ` with ${feat.length > 1 ? `${feat.slice(0, -1).join(", ")} and ${feat.at(-1)}` : feat[0]}` : ""}.${d.floorArea ? ` ${d.floorArea.toLocaleString()} sqm of living space.` : d.lotArea ? ` ${d.lotArea.toLocaleString()} sqm lot.` : ""}`;
    long = short;
  }
  return { taglines: taglines(d, amenities, seed), short: capWords(short, 60), long: capWords(long, 120), highlights, amenities, facts, removed };
}
