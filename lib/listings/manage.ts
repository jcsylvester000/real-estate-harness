/** WRITE SIDE (commands): single listings added, edited or deleted in the Listings app. */
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { command } from "./cqrs";
import { AVAILABILITY, KIND_IDS, KINDS, PROPERTY_TYPES, TRANSACTION_TYPES } from "./kinds";
import { withIndexFields, upsertListings } from "./import";
import { listings } from "./schema";
import { getListing } from "./search";

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

/** Command: add or edit one listing. Returns the listing as the read model now shows it (with its analysis). */
export async function saveListing(f: ListingForm, user: { id?: string; displayName: string; role: string }) {
  const code = await command(user.id ?? null, async (tx) => {
    const [existing] = f.code ? await tx.select().from(listings).where(eq(listings.code, f.code)) : [];
    const code = existing?.code ?? f.code ?? `GRID-M-${randomBytes(4).toString("hex").toUpperCase()}`;
    const form = f.propertySubType && KINDS[f.propertySubType]?.type !== f.propertyType && f.propertyType !== "land" ? { ...f, propertyType: KINDS[f.propertySubType]!.type } : f;
    const row = withIndexFields({
      code,
      source: existing?.source ?? "manual",
      name: form.name,
      notes: form.notes,
      availability: form.availability,
      transactionType: form.transactionType,
      propertyType: form.propertyType,
      propertySubType: form.propertySubType,
      pricePhp: form.price.toFixed(2),
      location: form.location,
      bedrooms: form.bedrooms,
      bathrooms: form.bathrooms,
      floorAreaSqm: form.floorAreaSqm === null ? null : String(form.floorAreaSqm),
      lotAreaSqm: form.lotAreaSqm === null ? null : String(form.lotAreaSqm),
      titleType: form.titleType,
      foreignEligible: form.foreignEligible,
      listedBy: existing?.listedBy || user.displayName,
      listedByType: existing?.listedByType || user.role,
      listedByEmail: existing?.listedByEmail ?? "",
    });
    await upsertListings(tx, [row]);
    // Fields an import leaves alone are set by manual edits.
    await tx.update(listings).set({ notes: row.notes, bathrooms: row.bathrooms, titleType: row.titleType, foreignEligible: row.foreignEligible }).where(eq(listings.code, code));
    return { result: code, events: [{ type: "ListingSaved" as const, keys: [code] as [string], payload: { manual: true } }] };
  });
  return (await getListing(code))!;
}

/** Command: delete one listing. */
export async function deleteListing(code: string, actor?: string) {
  return command(actor ?? null, async (tx) => {
    const rows = await tx.delete(listings).where(eq(listings.code, code)).returning({ code: listings.code });
    return { result: rows.length > 0, events: rows.length ? [{ type: "ListingDeleted" as const, keys: [code] as [string] }] : [] };
  });
}
