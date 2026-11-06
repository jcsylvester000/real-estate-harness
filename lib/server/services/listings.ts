/**
 * Listings service: the indexed listings database behind the Listings and Property Finder apps, the
 * listings.* driver methods and the harness tools (search_listings, get_listing_index, get_listing).
 */
import { setListingBackend } from "@/lib/harness";
import { getListingsDb } from "@/lib/listings/db";
import { importGridCsv, listImports } from "@/lib/listings/import";
import { parseInquiry } from "@/lib/listings/inquiry";
import { deleteListing, saveListing, type ListingForm } from "@/lib/listings/manage";
import { facets, getListing, searchInput, searchListings, toAiListing, type SearchInput } from "@/lib/listings/search";
import { invalid } from "../errors";

export async function search(input: SearchInput) {
  return searchListings(await getListingsDb(), input);
}

/** Free text in, filters + results out. No AI involved. */
export async function ask(text: string, opts: { limit?: number; offset?: number; sort?: SearchInput["sort"] } = {}) {
  const parsed = parseInquiry(text);
  const result = await search({ ...parsed.filters, ...opts });
  return { parsed, result };
}

export async function index() {
  return facets(await getListingsDb());
}

/** One listing. The uploader's email is shown only to GRID brokers and admins in built-in apps. */
export async function get(code: string, opts: { withContact: boolean }) {
  const l = await getListing(await getListingsDb(), code);
  if (!l) return null;
  const { listedByEmail, ...rest } = l;
  return opts.withContact ? { ...rest, listedByEmail } : rest;
}

export async function save(form: ListingForm, user: { displayName: string; role: string }) {
  return saveListing(await getListingsDb(), form, user);
}

export async function remove(code: string) {
  return deleteListing(await getListingsDb(), code);
}

export async function importCsv(input: { fileName: string; csv: string }, userId: string) {
  try {
    return await importGridCsv(await getListingsDb(), { ...input, userId });
  } catch (err) {
    if (err instanceof Error && /export|rows|8 MB/.test(err.message)) throw invalid(err.message);
    throw err;
  }
}

export async function imports() {
  return listImports(await getListingsDb());
}

// The harness reads the same index. Results go to the AI without uploader names or contacts.
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
    return { ...toAiListing(l), notes: l.notes, bathrooms: l.bathrooms, titleType: l.titleType, foreignEligible: l.foreignEligible, publishedAt: l.publishedAt };
  },
});
