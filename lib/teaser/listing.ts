/**
 * Listing → teaser details, and saved designs ("my templates") that keep the look while the property switches.
 * A design is a TeaserDoc with the property details emptied: brand, fonts, layout, agent and every slide stay.
 * Bound elements (property.*, photo:n, amenity:i…) then fill from whichever listing it is applied to.
 */
import { writeCopy } from "./copy";
import { applyGenerators } from "./templates";
import { boundText } from "./format";
import { emptyProperty, type PropertyDetails, type TeaserDoc } from "./types";

export interface ListingLike {
  code: string;
  name: string;
  notes?: string | null;
  transactionType?: string | null;
  kindLabel?: string | null;
  price?: number | null;
  location?: string | null;
  city?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floorAreaSqm?: number | null;
  lotAreaSqm?: number | null;
}

/** Details for a listing. Uploader names and emails are never copied. */
export function propertyFromListing(l: ListingLike, keep?: Partial<PropertyDetails>): PropertyDetails {
  const c = writeCopy(`${l.name}\n${l.notes ?? ""}`, {}, 0);
  return {
    ...emptyProperty(),
    ...keep,
    name: l.name,
    listingCode: l.code,
    transaction: l.transactionType === "lease" ? "lease" : "sale",
    kind: l.kindLabel ?? "",
    price: l.price ?? null,
    location: l.location ?? "",
    city: l.city ?? "",
    bedrooms: l.bedrooms ?? null,
    bathrooms: l.bathrooms ?? null,
    floorArea: l.floorAreaSqm ?? null,
    lotArea: l.lotAreaSqm ?? null,
    description: c.short || keep?.description || "",
    tagline: c.taglines[0] ?? keep?.tagline ?? "",
    highlights: c.highlights.length ? c.highlights : (keep?.highlights ?? []),
    amenities: [...new Set([...(keep?.amenities ?? []), ...c.amenities])],
    photos: keep?.photos ?? [],
  };
}

/** Hand-typed (unbound) texts that contain this property's own details: they would not switch with the listing. */
export function stuckTexts(doc: TeaserDoc): string[] {
  const p = doc.property;
  const needles = [p.name, p.location, p.city, boundText("property.price", doc, false) ?? "", p.listingCode ?? ""]
    .map((x) => x.trim())
    .filter((x) => x.length >= 4)
    .map((x) => x.toLowerCase());
  const out: string[] = [];
  for (const s of doc.slides)
    for (const e of s.elements)
      if (e.type === "text" && !e.bind && !e.auto && needles.some((n) => e.text.toLowerCase().includes(n))) out.push(e.text.slice(0, 80));
  return out;
}

/** The design without this property: what is saved as "my template". Photos placed by hand are kept. */
export function toDesign(doc: TeaserDoc): TeaserDoc {
  return applyGenerators({ ...doc, property: emptyProperty() });
}

/** A saved design filled with a property. */
export function fromDesign(design: TeaserDoc, property: PropertyDetails): TeaserDoc {
  return applyGenerators({ ...structuredClone(design), property });
}
