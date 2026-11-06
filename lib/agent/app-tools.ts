/**
 * Agent harness tools: Grid's own app capabilities (driver methods) offered to the AI as tools.
 * Every call goes through the same driver gate as the apps (permission → role → schema), as the app the
 * person is using, so the AI can do only what that app and person may do. Results are trimmed and
 * uploader contact details are removed before the model sees them.
 */
import { z } from "zod";
import type { HarnessTool, JsonSchema } from "@/lib/harness";
import { understand } from "@/lib/teaser/intake";
import { fromDesign, propertyFromListing } from "@/lib/teaser/listing";
import { applyGenerators, brandFrom, newDoc, templateById, DECK_TEMPLATES, TRAILER_TEMPLATES } from "@/lib/teaser/templates";
import { emptyAgent, type TeaserDoc } from "@/lib/teaser/types";

export interface AppBridge {
  call(method: string, params: unknown): Promise<unknown>;
  schema(method: string): z.ZodType | undefined;
  /** The app may use this method (declared permission). */
  allowed(method: string): boolean;
}

/** Something the user can open from the answer (an Open button in Deal Desk). */
export interface AppAction {
  app: string;
  label: string;
  args?: Record<string, unknown>;
}

interface Spec {
  method: string;
  name: string;
  description: string;
  write?: boolean;
  /** Narrows or fixes arguments before the call. */
  prepare?: (args: Record<string, unknown>) => Record<string, unknown>;
}

const SPECS: Spec[] = [
  { method: "listings.ask", name: "app_listings_ask", description: "Search the brokerage's listings with a plain-language request (e.g. '2BR condo for rent in BGC under 60k'). Returns ranked listings with codes." },
  { method: "listings.search", name: "app_listings_search", description: "Search listings with filters (query, transactionType, kind, city, minPrice, maxPrice, minBedrooms, sort, limit)." },
  { method: "listings.get", name: "app_listing_details", description: "Full details and analysis of one listing by code." },
  { method: "listings.facets", name: "app_listings_overview", description: "What the listings index contains: places, kinds, price ranges, counts." },
  { method: "match.run", name: "app_match_buyer", description: "Score listings 1–10 for a buyer's criteria (kind, place, budget, bedrooms, size, purpose, features, each with an importance). Returns the best matches with reasons." },
  { method: "match.buyers", name: "app_saved_buyers", description: "The saved buyer profiles." },
  { method: "match.buyerMatches", name: "app_saved_buyer_matches", description: "Best listings for a saved buyer (by id)." },
  { method: "match.listingBuyers", name: "app_listing_buyers", description: "Saved buyers that match a listing (by code)." },
  { method: "match.saveBuyer", name: "app_save_buyer", description: "Save a buyer profile (name and criteria) so new listings are matched automatically. Only when the user asks.", write: true },
  { method: "lenders.compare", name: "app_compare_lenders", description: "Compare home loan monthly payments across Pag-IBIG and banks for a price, down payment and term." },
  { method: "lenders.list", name: "app_lenders", description: "Lenders with their published rates, sources and as-of dates." },
  { method: "docs.list", name: "app_documents", description: "Uploaded documents (contracts, reports, photos with text)." },
  { method: "docs.search", name: "app_search_documents", description: "Search inside uploaded documents and notes; returns passages with the document name." },
  { method: "docs.notes", name: "app_notes", description: "Recent notes with a preview." },
  { method: "fs.list", name: "app_files_list", description: "List a folder in the user's Files (default /)." },
  { method: "fs.read", name: "app_file_read", description: "Read a text file or note from Files by path." },
  {
    method: "fs.write",
    name: "app_file_write",
    description: "Save a text or Markdown file in the user's Files (e.g. /Notes/Client brief.md or /Deals/…). Does not overwrite unless overwrite is true. Only when the user asks to save something.",
    write: true,
    prepare: (a) => ({ path: a.path, content: a.content, overwrite: a.overwrite === true, createParents: true, encoding: "utf8", mime: String(a.path ?? "").endsWith(".md") ? "text/markdown" : "text/plain" }),
  },
  { method: "teaser.list", name: "app_teaser_projects", description: "Property Teaser projects (presentations and trailers)." },
  { method: "teaser.templates", name: "app_teaser_designs", description: "The user's saved Property Teaser designs (reusable looks)." },
];

/** fs.write is offered with a smaller, text-only schema. */
const FS_WRITE = z.object({ path: z.string().min(2).max(300).describe("Absolute path, e.g. /Notes/Buyer brief - Santos.md"), content: z.string().max(200_000), overwrite: z.boolean().optional() });

const KEEP = new Set(["type", "description", "properties", "required", "enum", "items", "minimum", "maximum"]);
/** zod → the JSON-schema subset every provider accepts (no $schema, defaults, unions or formats). */
export function toToolParams(schema: z.ZodType): JsonSchema {
  let j: Record<string, unknown>;
  try {
    j = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  } catch {
    return { type: "object", properties: {} };
  }
  const clean = (n: Record<string, unknown>): Record<string, unknown> => {
    const any = (n.anyOf ?? n.oneOf) as Record<string, unknown>[] | undefined;
    if (any?.length) n = { ...(any.find((x) => x.type !== "null") ?? any[0]), description: n.description };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n)) {
      if (!KEEP.has(k) || v === undefined) continue;
      if (k === "properties") out[k] = Object.fromEntries(Object.entries(v as Record<string, Record<string, unknown>>).map(([pk, pv]) => [pk, clean(pv)]));
      else if (k === "items") out[k] = clean(v as Record<string, unknown>);
      else if (k === "type") out[k] = Array.isArray(v) ? (v.find((t) => t !== "null") ?? "string") : v;
      else if (k === "enum") out[k] = (v as unknown[]).filter((x) => x !== null).map(String);
      else if ((k === "minimum" || k === "maximum") && Math.abs(v as number) >= Number.MAX_SAFE_INTEGER) continue;
      else out[k] = v;
    }
    if (!out.type) out.type = out.properties ? "object" : "string";
    if (out.type === "object" && !out.properties) out.properties = {};
    return out;
  };
  const r = clean(j) as unknown as JsonSchema;
  return r.type === "object" ? r : { type: "object", properties: {} };
}

/** Removes uploader contact details and bounds the size of what the model reads. */
export function forModel(v: unknown, depth = 0): unknown {
  if (Array.isArray(v)) return v.slice(0, 25).map((x) => forModel(x, depth + 1));
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (/^listedBy|^uploader|^owner(Email|Name)?$|passwordHash|apiKey|secret/i.test(k)) continue;
      if (k === "thumb" || k === "data") continue;
      o[k] = forModel(x, depth + 1);
    }
    return o;
  }
  if (typeof v === "string" && v.length > 8000) return `${v.slice(0, 8000)}… (cut; ${v.length} characters in all)`;
  return v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function appTools(bridge: AppBridge, actions: AppAction[]): HarnessTool<any>[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: HarnessTool<any>[] = [];
  for (const s of SPECS) {
    if (!bridge.allowed(s.method)) continue;
    const schema = s.method === "fs.write" ? FS_WRITE : bridge.schema(s.method);
    if (!schema) continue;
    tools.push({
      definition: { name: s.name, description: s.description + (s.write ? " (Changes data.)" : ""), parameters: toToolParams(schema) },
      run: async (args: Record<string, unknown>) => {
        try {
          const out = await bridge.call(s.method, s.prepare ? s.prepare(args) : args);
          if (s.method === "fs.write") actions.push({ app: "files", label: `Open ${String(args.path).split("/").pop()}`, args: { path: String(args.path).replace(/\/[^/]*$/, "") || "/" } });
          return forModel(out);
        } catch (e) {
          const err = e as { code?: string; message?: string };
          return { error: err.message ?? "That did not work.", code: err.code };
        }
      },
    });
  }

  if (bridge.allowed("teaser.save")) {
    const all = [...DECK_TEMPLATES, ...TRAILER_TEMPLATES];
    tools.push({
      definition: {
        name: "app_make_teaser",
        description:
          "Create a Property Teaser presentation (deck) or teaser trailer project from a listing code and/or a free-text description of the property (spelling is fixed automatically). Optionally use a template id or one of the user's saved designs. Returns the project and an Open button. Only when the user asks for a presentation, teaser, brochure or trailer.",
        parameters: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["deck", "trailer"] },
            listing_code: { type: "string", description: "Listing code to fill the details from." },
            details: { type: "string", description: "Property details in plain words (name, type, place, size, price, features, contact)." },
            template: { type: "string", enum: all.map((t) => t.id), description: "Template id (optional)." },
            design_id: { type: "string", description: "Saved design id from app_teaser_designs (optional)." },
            title: { type: "string" },
          },
          required: ["kind"],
        },
      },
      run: async (a: { kind: "deck" | "trailer"; listing_code?: string; details?: string; template?: string; design_id?: string; title?: string }) => {
        try {
          let property = understand({ all: a.details ?? "" }).property;
          let agent = understand({ contact: a.details ?? "" }).agent;
          if (a.listing_code) {
            const l = (await bridge.call("listings.get", { code: a.listing_code })) as Parameters<typeof propertyFromListing>[0] | null;
            if (!l) return { error: `No listing ${a.listing_code}.` };
            property = propertyFromListing(l, a.details ? property : undefined);
          }
          if (!property.name && !a.details) return { error: "Give a listing_code or the property details." };
          let doc: TeaserDoc;
          if (a.design_id) {
            const d = (await bridge.call("teaser.getTemplate", { id: a.design_id })) as { data: unknown };
            const design = d.data as TeaserDoc;
            doc = fromDesign(design, property);
            if (!agent.name && !agent.phone) agent = design.agent ?? emptyAgent();
            doc = { ...doc, agent };
          } else {
            const t = templateById(a.template ?? "") ?? (a.kind === "trailer" ? TRAILER_TEMPLATES[0]! : DECK_TEMPLATES[0]!);
            doc = applyGenerators(newDoc(t, { property, agent, brand: brandFrom(t) }));
          }
          const title = (a.title || property.name || (a.kind === "trailer" ? "New teaser trailer" : "New presentation")).slice(0, 120);
          const r = (await bridge.call("teaser.save", { kind: doc.kind, title, templateId: doc.templateId, data: doc })) as { id: string };
          actions.push({ app: "property-teaser", label: `Open “${title}” in Property Teaser`, args: { project: r.id } });
          return { created: true, id: r.id, title, kind: doc.kind, template: doc.templateId, slides: doc.slides.length, property: { name: property.name, price: property.price, location: property.location || property.city }, note: "Photos are not added automatically; the user adds them in Property Teaser before exporting." };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    });
  }

  tools.push({
    definition: {
      name: "app_open",
      description: "Offer an Open button for an app: property-finder (query: a listing code or a plain request), listings, buyer-match, calculators (tool: mortgage | rates | compute_acquisition_costs | compute_loan_amortization | compute_commission | compute_maceda_refund | check_foreign_ownership), property-teaser (project id), files (folder path), notes (note path).",
      parameters: {
        type: "object",
        properties: {
          app: { type: "string", enum: ["property-finder", "listings", "buyer-match", "calculators", "property-teaser", "files", "notes"] },
          label: { type: "string", description: "Button text, e.g. 'Open GRID-0012 in Property Finder'." },
          query: { type: "string" },
          tool: { type: "string" },
          project: { type: "string" },
          path: { type: "string" },
        },
        required: ["app", "label"],
      },
    },
    run: (a: Record<string, string>) => {
      const args: Record<string, unknown> = {};
      if (a.query) args.q = a.query;
      if (a.tool) args.tool = a.tool;
      if (a.project) args.project = a.project;
      if (a.path) args.path = a.path;
      if (actions.length >= 6) return { error: "Enough buttons already." };
      actions.push({ app: a.app!, label: a.label!.slice(0, 80), args });
      return { ok: true, shown_as_button: a.label };
    },
  });
  return tools;
}
