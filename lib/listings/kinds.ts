/** Property types, sub-types ("kinds") and the words people use for them. Shared by the importer, search and the inquiry parser. */

export const TRANSACTION_TYPES = ["sale", "lease"] as const;
export const PROPERTY_TYPES = ["residential", "commercial", "land", "industrial", "agricultural", "other"] as const;
export const AVAILABILITY = ["available", "inactive", "reserved", "sold"] as const;

/** Every sub-type seen in GRID exports, its parent type, and search words (first word list = how people ask). */
/** words: generic names indexed as synonyms of the kind. cues: specific words that only help guess the kind from a name or question. */
export const KINDS: Record<string, { type: (typeof PROPERTY_TYPES)[number]; label: string; words: string[]; cues?: string[] }> = {
  "condominium-unit": { type: "residential", label: "Condominium unit", words: ["condo", "condominium", "condo unit"], cues: ["studio", "loft", "penthouse", "serviced residence", "1br", "2br", "3br", "residences", "suites"] },
  "house-and-lot": { type: "residential", label: "House and lot", words: ["house and lot", "house & lot", "house"], cues: ["single detached", "bungalow", "villa", "duplex"] },
  townhouse: { type: "residential", label: "Townhouse", words: ["townhouse", "town house", "rowhouse"] },
  apartment: { type: "residential", label: "Apartment", words: ["apartment", "apartment building", "dormitory", "boarding house"] },
  "residential-lot": { type: "land", label: "Residential lot", words: ["residential lot", "vacant lot", "lot only", "lot"] },
  "subdivision-lot": { type: "land", label: "Subdivision lot", words: ["subdivision lot"] },
  "commercial-lot": { type: "commercial", label: "Commercial lot", words: ["commercial lot"] },
  "industrial-lot": { type: "industrial", label: "Industrial lot", words: ["industrial lot"] },
  "office-space": { type: "commercial", label: "Office space", words: ["office", "office space", "office unit"] },
  "retail-space": { type: "commercial", label: "Retail space", words: ["retail", "retail space", "shop", "store", "commercial space"] },
  "whole-commercial-building": { type: "commercial", label: "Commercial building", words: ["commercial building", "building", "storey building", "story building"] },
  "mixed-use-building": { type: "commercial", label: "Mixed-use building", words: ["mixed use", "mixed-use"] },
  warehouse: { type: "industrial", label: "Warehouse", words: ["warehouse", "storage"] },
  "industrial-compound": { type: "industrial", label: "Industrial compound", words: ["industrial compound", "factory", "plant"] },
  "hotel-resort": { type: "commercial", label: "Hotel or resort", words: ["hotel", "resort", "inn"] },
  "farm-lot": { type: "agricultural", label: "Farm or agricultural lot", words: ["farm", "farm lot", "agricultural", "farmland", "plantation"] },
};
export const KIND_IDS = Object.keys(KINDS);

/** Kind ids ordered so that multi-word phrases win ("commercial lot" before "lot"). */
const BY_PHRASE = Object.entries(KINDS)
  .flatMap(([id, k]) => [...k.words, ...(k.cues ?? [])].map((w) => ({ id, w })))
  .sort((a, b) => b.w.length - a.w.length);

/** Kind named in a text, or null. Lots resolve by property type: a "lot" in a commercial listing is a commercial lot. */
export function kindFromText(text: string, propertyType?: string): string | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9&-]+/g, " ")} `;
  for (const { id, w } of BY_PHRASE) {
    if (!t.includes(` ${w} `)) continue;
    // A guessed kind must fit the listing's stated type (lots are handled below).
    if (propertyType && id !== "residential-lot" && KINDS[id]!.type !== propertyType && !(propertyType === "land" && id.endsWith("-lot"))) continue;
    if (id === "residential-lot" && propertyType) {
      if (propertyType === "commercial") return "commercial-lot";
      if (propertyType === "industrial") return "industrial-lot";
      if (propertyType === "agricultural") return "farm-lot";
    }
    return id;
  }
  if (propertyType === "agricultural") return "farm-lot";
  return null;
}

/** Search words for a listing's kind and transaction, so "condo for rent" matches a condominium-unit lease. */
export function kindWords(kind: string, propertyType: string, transactionType: string) {
  const k = KINDS[kind];
  return [propertyType, kind.replace(/-/g, " "), ...(k?.words ?? []), transactionType === "lease" ? "lease rent rental for rent" : "sale for sale buy"].join(" ");
}
