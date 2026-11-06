/** Text helpers for the listings index: accent-free lowercase text, and facts parsed from listing names. */

/** "Parañaque City, P. Burgos St." → "paranaque city p burgos st" */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "3BR", "3 BR", "3-bedroom", "studio" → 3 / 0; null when not stated. */
export function parseBedrooms(s: string): number | null {
  if (/\bstudio\b/i.test(s)) return 0;
  const m = s.match(/\b(\d{1,2})\s*-?\s*(?:br|bdr|bedrooms?|bedroom)\b/i);
  return m ? Number(m[1]) : null;
}

/** "1,344 sqm", "79sqm", "150 sq.m.", "2.5 hectares" → square metres; null when not stated. */
export function parseAreaSqm(s: string): number | null {
  const ha = s.match(/(\d+(?:[.,]\d+)?)\s*-?\s*(?:hectares?|has?\b|ha\.)/i);
  if (ha) return Math.round(Number(ha[1]!.replace(",", ".")) * 10_000);
  const m = s.match(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?:sqm|sq\.?\s*m\.?|square\s*met(?:er|re)s?|m2|m²)/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Splits normalized text into search words, dropping filler words. */
const STOP = new Set(["a", "an", "the", "for", "in", "at", "of", "and", "or", "with", "to", "near", "on", "by", "sale", "lease", "rent", "philippines", "phl", "city", "ph"]);
export const searchWords = (s: string) => normalizeText(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w));
