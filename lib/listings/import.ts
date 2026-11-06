/**
 * WRITE SIDE (commands): imports listings into the write model — GRID "listings-published" CSV exports and the
 * harness demo set. Each import appends a ListingsImported event; the projector builds the read models.
 */
import { desc, sql } from "drizzle-orm";
import demo from "@/lib/harness/sample-listings.json";
import type { ListingsDB } from "./db";
import { kindFromText, KINDS, PROPERTY_TYPES, TRANSACTION_TYPES } from "./kinds";
import { parseAreaSqm, parseBedrooms } from "./normalize";
import { resolvePlace } from "./places";
import { importBatches, listings } from "./schema";
import { command, query } from "./cqrs";

export type ListingValues = typeof listings.$inferInsert;
export type ImportProblem = { row: number; code: string; reason: string };

export const IMPORT_LIMITS = { maxRows: 20_000, maxBytes: 8 * 1024 * 1024, chunk: 200 };

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes, optional BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

const date = (v: string | undefined) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const clean = (v: string | undefined, max = 500) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Write-side enrichment: kind (stated or guessed), city and province, bedrooms from the name. */
export function withIndexFields(v: Omit<ListingValues, "kind" | "kindInferred" | "city" | "province"> & Partial<ListingValues>): ListingValues {
  const sub = v.propertySubType ?? "";
  const inferred = sub ? null : kindFromText(`${v.name} ${v.notes ?? ""}`, v.propertyType);
  const kind = sub || inferred || "";
  const place = v.city || v.province ? { city: v.city ?? null, province: v.province ?? null } : resolvePlace(`${v.location ?? ""} ${v.name}`);
  return {
    ...v,
    propertySubType: sub,
    kind,
    kindInferred: !sub && !!inferred,
    city: place.city,
    province: place.province,
    bedrooms: v.bedrooms ?? parseBedrooms(v.name),
  };
}

const REQUIRED = ["code", "name", "transactionType", "propertyType", "price", "location"];

/** Maps one GRID export row (by header name) to listing values, or a reason it was skipped. */
export function fromGridExport(r: Record<string, string>): ListingValues | string {
  const code = clean(r.code, 60);
  if (!/^[A-Za-z0-9_-]{3,60}$/.test(code)) return "missing or invalid code";
  const transactionType = clean(r.transactionType).toLowerCase();
  if (!(TRANSACTION_TYPES as readonly string[]).includes(transactionType)) return `unknown transactionType "${r.transactionType}"`;
  const propertyType = clean(r.propertyType).toLowerCase();
  if (!(PROPERTY_TYPES as readonly string[]).includes(propertyType)) return `unknown propertyType "${r.propertyType}"`;
  const price = Number(clean(r.price).replace(/[₱,\s]/g, ""));
  if (!Number.isFinite(price) || price <= 0 || price > 1e13) return `invalid price "${r.price}"`;
  const name = clean(r.name, 300).replace(/^[^\p{L}\p{N}]+/u, "");
  if (!name) return "missing name";
  const sub = clean(r.propertySubType).toLowerCase();
  const area = parseAreaSqm(name);
  return withIndexFields({
    code,
    source: "grid_export",
    name,
    notes: "",
    availability: clean(r.availability).toLowerCase() === "inactive" ? "inactive" : "available",
    transactionType,
    propertyType,
    propertySubType: KINDS[sub] ? sub : "",
    pricePhp: price.toFixed(2),
    location: clean(r.location, 300),
    floorAreaSqm: area && /condominium|office|retail|building|warehouse/.test(sub + name.toLowerCase()) ? String(area) : null,
    lotAreaSqm: area && !/condominium|office|retail/.test(sub + name.toLowerCase()) ? String(area) : null,
    listedBy: clean(r.uploader, 120),
    listedByType: clean(r.uploaderType, 40),
    listedByEmail: clean(r.uploaderEmail, 200),
    gridVerification: clean(r.gridVerification, 40),
    exclusive: clean(r.exclusive).toLowerCase() === "yes",
    sourceCreatedAt: date(r.createdAt),
    sourcePublishedAt: date(r.publishedAt),
    sourceUpdatedAt: date(r.updatedAt),
  });
}

const UPSERT_SET = {
  source: sql`excluded.source`,
  name: sql`excluded.name`,
  availability: sql`excluded.availability`,
  transactionType: sql`excluded.transaction_type`,
  propertyType: sql`excluded.property_type`,
  propertySubType: sql`excluded.property_sub_type`,
  kind: sql`excluded.kind`,
  kindInferred: sql`excluded.kind_inferred`,
  pricePhp: sql`excluded.price_php`,
  location: sql`excluded.location`,
  city: sql`excluded.city`,
  province: sql`excluded.province`,
  bedrooms: sql`excluded.bedrooms`,
  floorAreaSqm: sql`excluded.floor_area_sqm`,
  lotAreaSqm: sql`excluded.lot_area_sqm`,
  listedBy: sql`excluded.listed_by`,
  listedByType: sql`excluded.listed_by_type`,
  listedByEmail: sql`excluded.listed_by_email`,
  gridVerification: sql`excluded.grid_verification`,
  exclusive: sql`excluded.exclusive`,
  sourceCreatedAt: sql`excluded.source_created_at`,
  sourcePublishedAt: sql`excluded.source_published_at`,
  sourceUpdatedAt: sql`excluded.source_updated_at`,
  importBatchId: sql`excluded.import_batch_id`,
  updatedAt: sql`now()`,
};

/** Inserts or updates in chunks (write model only); returns how many rows were new. */
export async function upsertListings(db: Pick<ListingsDB, "insert">, rows: ListingValues[]) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += IMPORT_LIMITS.chunk) {
    const chunk = rows.slice(i, i + IMPORT_LIMITS.chunk);
    const res = await db
      .insert(listings)
      .values(chunk)
      .onConflictDoUpdate({ target: listings.code, set: UPSERT_SET })
      .returning({ isNew: sql<boolean>`(xmax = 0)` });
    inserted += res.filter((r) => r.isNew).length;
  }
  return inserted;
}

export interface ImportSummary {
  batchId: number;
  fileName: string;
  rowsTotal: number;
  inserted: number;
  updated: number;
  skipped: number;
  problems: ImportProblem[];
}

/**
 * Command: import a GRID listings CSV export. Rows with problems are skipped and reported; the rest are written
 * in one transaction with a ListingsImported event, then the read models are projected.
 */
export async function importGridCsv(input: { fileName: string; csv: string; userId?: string }): Promise<ImportSummary> {
  if (input.csv.length > IMPORT_LIMITS.maxBytes) throw new Error("The file is larger than 8 MB.");
  const table = parseCsv(input.csv);
  const header = (table[0] ?? []).map((h) => h.trim());
  const missing = REQUIRED.filter((h) => !header.includes(h));
  if (missing.length) throw new Error(`This does not look like a GRID listings export. Missing columns: ${missing.join(", ")}.`);
  const body = table.slice(1);
  if (body.length > IMPORT_LIMITS.maxRows) throw new Error(`At most ${IMPORT_LIMITS.maxRows.toLocaleString()} rows per import.`);
  const problems: ImportProblem[] = [];
  const byCode = new Map<string, ListingValues>();
  body.forEach((cells, i) => {
    const rec = Object.fromEntries(header.map((h, j) => [h, cells[j] ?? ""]));
    const v = fromGridExport(rec);
    if (typeof v === "string") problems.push({ row: i + 2, code: clean(rec.code, 60), reason: v });
    else byCode.set(v.code, v); // a code repeated in one file: the last row wins
  });
  return command(input.userId ?? null, async (tx) => {
    const [batch] = await tx
      .insert(importBatches)
      .values({ fileName: input.fileName.slice(0, 200), source: "grid_export", rowsTotal: body.length, createdBy: input.userId ?? null })
      .returning({ id: importBatches.id });
    const rows = [...byCode.values()].map((r) => ({ ...r, importBatchId: batch!.id }));
    const inserted = await upsertListings(tx, rows);
    const summary = { inserted, updated: rows.length - inserted, skipped: problems.length, problems: problems.slice(0, 50) };
    await tx.update(importBatches).set(summary).where(sql`${importBatches.id} = ${batch!.id}`);
    return {
      result: { batchId: batch!.id, fileName: input.fileName, rowsTotal: body.length, ...summary },
      events: rows.length ? [{ type: "ListingsImported" as const, keys: rows.map((r) => r.code), payload: { batchId: batch!.id } }] : [],
    };
  });
}

/** Query: recent import batches. */
export function listImports() {
  return query("imports", async (db) => {
    const rows = await db.select().from(importBatches).orderBy(desc(importBatches.id)).limit(20);
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  });
}

type DemoListing = { id: string; title: string; city: string; area: string; propertyType: string; bedrooms: number; bathrooms: number; floorAreaSqm: number | null; lotAreaSqm: number | null; price: number; status: string; titleType: string; foreignEligible: boolean; notes: string };
const DEMO_KIND: Record<string, [string, string]> = { condominium: ["residential", "condominium-unit"], house_and_lot: ["residential", "house-and-lot"], lot: ["land", "residential-lot"], commercial: ["commercial", "office-space"] };

/** Command: loads the harness's 8 fictitious demo listings (source "demo"). Safe to run repeatedly. */
export async function seedDemoListings() {
  const rows = (demo as DemoListing[]).map((l) =>
    withIndexFields({
      code: l.id,
      source: "demo",
      name: l.title,
      notes: l.notes,
      availability: l.status === "sold" ? "sold" : l.status === "reserved" ? "reserved" : "available",
      transactionType: l.status === "for_lease" ? "lease" : "sale",
      propertyType: DEMO_KIND[l.propertyType]?.[0] ?? "other",
      propertySubType: DEMO_KIND[l.propertyType]?.[1] ?? "",
      pricePhp: l.price.toFixed(2),
      location: `${l.area}, ${l.city}`,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      floorAreaSqm: l.floorAreaSqm === null ? null : String(l.floorAreaSqm),
      lotAreaSqm: l.lotAreaSqm === null ? null : String(l.lotAreaSqm),
      foreignEligible: l.foreignEligible,
      titleType: l.titleType,
      listedBy: "GRID demo",
    }),
  );
  return command(null, async (tx) => {
    const added = await tx.insert(listings).values(rows).onConflictDoNothing().returning({ code: listings.code });
    return { result: rows.length, events: added.length ? [{ type: "ListingsImported" as const, keys: added.map((a) => a.code), payload: { demo: true } }] : [] };
  });
}
