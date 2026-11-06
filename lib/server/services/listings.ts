/**
 * Listings service: the listings.* and match.* driver methods and the harness listing tools' backend.
 * Commands (import, save, delete, buyer profiles) go to the write model; everything else is a query on the
 * read models (lib/listings/cqrs.ts).
 */
import { setListingBackend } from "@/lib/harness";
import { buyersForListing, deleteBuyer, listBuyers, matchesForBuyer, matchNow, saveBuyer, type BuyerInput } from "@/lib/listings/buyers";
import { importGridCsv, listImports } from "@/lib/listings/import";
import { parseInquiry } from "@/lib/listings/inquiry";
import { deleteListing, saveListing, type ListingForm } from "@/lib/listings/manage";
import type { BuyerCriteria } from "@/lib/listings/match";
import { facets, getListing, searchInput, searchListings, toAiListing, type SearchInput } from "@/lib/listings/search";
import { invalid, notFound } from "../errors";

// -- Queries --

export const search = (input: SearchInput) => searchListings(input);

/** Free text in, filters + results out. No AI involved. */
export async function ask(text: string, opts: { limit?: number; offset?: number; sort?: SearchInput["sort"] } = {}) {
  const parsed = parseInquiry(text);
  const result = await searchListings({ ...parsed.filters, ...opts });
  return { parsed, result };
}

export const index = () => facets();

/** One listing. The uploader's email is shown only to GRID brokers and admins in built-in apps. */
export async function get(code: string, opts: { withContact: boolean }) {
  const l = await getListing(code);
  if (!l) return null;
  const { listedByEmail, ...rest } = l;
  return opts.withContact ? { ...rest, listedByEmail } : rest;
}

export const imports = () => listImports();
export const match = (criteria: BuyerCriteria, page: { limit?: number; offset?: number }) => matchNow(criteria, page);
export const buyers = () => listBuyers();
export async function buyerMatches(id: string, page: { limit?: number; offset?: number }) {
  const r = await matchesForBuyer(id, page);
  if (!r) throw notFound("Buyer profile");
  return r;
}
export const listingBuyers = (code: string) => buyersForListing(code);

// -- Commands --

export const save = (form: ListingForm, user: { id: string; displayName: string; role: string }) => saveListing(form, user);
export const remove = (code: string, actor: string) => deleteListing(code, actor);
export const saveBuyerProfile = (input: BuyerInput, actor: string) => saveBuyer(input, actor);
export const deleteBuyerProfile = (id: string, actor: string) => deleteBuyer(id, actor);

export async function importCsv(input: { fileName: string; csv: string }, userId: string) {
  try {
    return await importGridCsv({ ...input, userId });
  } catch (err) {
    if (err instanceof Error && /export|rows|8 MB/.test(err.message)) throw invalid(err.message);
    throw err;
  }
}

// The harness reads the same read models. Results go to the AI without uploader names or contacts.
setListingBackend({
  async search(raw) {
    const parsed = searchInput.safeParse(raw);
    if (!parsed.success) return { total: 0, listings: [], notes: [`Invalid search: ${parsed.error.issues[0]?.message ?? "check the filters"}`] };
    const r = await search({ ...parsed.data, limit: Math.min(parsed.data.limit ?? 5, 10) });
    return {
      total: r.total,
      matchMode: r.matchMode,
      applied: r.applied,
      notes: r.total === 0 ? [...r.notes, "No matching listings in the index. Do not invent listings; use get_listing_index to suggest what is available."] : r.notes,
      listings: r.listings.map(toAiListing),
    };
  },
  async index() {
    const f = await index();
    return { ...f, byCity: f.byCity.slice(0, 40), note: "Counts are available listings only. Prices: sale price, or monthly rent for leases (PHP)." };
  },
  async get(code) {
    const l = await get(code, { withContact: false });
    if (!l) return null;
    return { ...toAiListing(l), notes: l.notes, bathrooms: l.bathrooms, titleType: l.titleType, foreignEligible: l.foreignEligible, publishedAt: l.publishedAt, analysis: l.analysis };
  },
});
