/** Single listings added or edited in the Listings app. They land in the same index as imports. */
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { ListingsDB } from "./db";
import { AVAILABILITY, KIND_IDS, KINDS, PROPERTY_TYPES, TRANSACTION_TYPES } from "./kinds";
import { withIndexFields, upsertListings } from "./import";
import { listings } from "./schema";
import { clearFacetCache, getListing } from "./search";

export const listingForm = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{3,60}$/).optional(),
  name: z.string().trim().min(3).max(300),
  transactionType: z.enum(TRANSACTION_TYPES),
  propertyType: z.enum(PROPERTY_TYPES),
  propertySubType: z.union([z.enum(KIND_IDS as [string, ...string[]]), z.literal("")]).default(""),
  price: z.coerce.number().positive().max(1e13),
  location: z.string().trim().min(2).max(300),
  availability: z.enum(AVAILABILITY).default("available"),
  bedrooms: z.coerce.number().int().min(0).max(50).nullable().default(null),
  bathrooms: z.coerce.number().int().min(0).max(50).nullable().default(null),
  floorAreaSqm: z.coerce.number().min(0).max(10_000_000).nullable().default(null),
  lotAreaSqm: z.coerce.number().min(0).max(1_000_000_000).nullable().default(null),
  titleType: z.string().trim().max(40).default(""),
  foreignEligible: z.boolean().nullable().default(null),
  notes: z.string().trim().max(4000).default(""),
});
export type ListingForm = z.infer<typeof listingForm>;

export async function saveListing(db: ListingsDB, f: ListingForm, user: { displayName: string; role: string }) {
  const existing = f.code ? await getListing(db, f.code) : null;
  const code = existing?.code ?? f.code ?? `GRID-M-${randomBytes(4).toString("hex").toUpperCase()}`;
  if (f.propertySubType && KINDS[f.propertySubType]?.type !== f.propertyType && f.propertyType !== "land")
    f = { ...f, propertyType: KINDS[f.propertySubType]!.type };
  const row = withIndexFields({
    code,
    source: existing?.source ?? "manual",
    name: f.name,
    notes: f.notes,
    availability: f.availability,
    transactionType: f.transactionType,
    propertyType: f.propertyType,
    propertySubType: f.propertySubType,
    pricePhp: f.price.toFixed(2),
    location: f.location,
    bedrooms: f.bedrooms,
    bathrooms: f.bathrooms,
    floorAreaSqm: f.floorAreaSqm === null ? null : String(f.floorAreaSqm),
    lotAreaSqm: f.lotAreaSqm === null ? null : String(f.lotAreaSqm),
    titleType: f.titleType,
    foreignEligible: f.foreignEligible,
    listedBy: existing?.listedBy || user.displayName,
    listedByType: existing?.listedByType || user.role,
    listedByEmail: existing?.listedByEmail ?? "",
  });
  // Manual edits also set the fields an import leaves alone.
  await upsertListings(db, [row]);
  await db
    .update(listings)
    .set({ notes: row.notes, notesNorm: row.notesNorm, bathrooms: row.bathrooms, titleType: row.titleType, foreignEligible: row.foreignEligible })
    .where(eq(listings.code, code));
  clearFacetCache();
  return (await getListing(db, code))!;
}

export async function deleteListing(db: ListingsDB, code: string) {
  const rows = await db.delete(listings).where(eq(listings.code, code)).returning({ code: listings.code });
  clearFacetCache();
  return rows.length > 0;
}
