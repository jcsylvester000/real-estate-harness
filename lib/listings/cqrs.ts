/**
 * CQRS plumbing for the listings database.
 *
 *  command(name, fn)  runs a write in one transaction on the WRITE connection; fn returns its result and the
 *                     events it caused. Events are appended to the event log in the same transaction, then the
 *                     projector updates the read models right away (so the caller reads its own write).
 *  query(key, fn)     runs a read on the READ connection (a Neon read replica when configured) through a cache
 *                     keyed by the read-model version: repeated queries cost no database round trip until the
 *                     next command changes the read models.
 *  Other server instances notice new events within VERSION_TTL_MS and catch up (ensureProjected).
 */
import { sql } from "drizzle-orm";
import { getListingsDb, type ListingsDB } from "./db";
import { events, projectionState } from "./schema";

export type ListingEvent =
  | { type: "ListingsImported"; keys: string[]; payload?: Record<string, unknown> }
  | { type: "ListingSaved"; keys: [string]; payload?: Record<string, unknown> }
  | { type: "ListingDeleted"; keys: [string] }
  | { type: "BuyerProfileSaved"; keys: [string] }
  | { type: "BuyerProfileDeleted"; keys: [string] };

export type Tx = Parameters<Parameters<ListingsDB["transaction"]>[0]>[0];

const VERSION_TTL_MS = 2000;
const CACHE_MAX = 500;

declare global {
  var __gaReadCache: { version: number; checkedAt: number; entries: Map<string, unknown> } | undefined;
}
const cache = () => (globalThis.__gaReadCache ??= { version: -1, checkedAt: 0, entries: new Map() });

/** Runs a command: write + events in one transaction, then projection. */
export async function command<T>(actor: string | null, fn: (tx: Tx) => Promise<{ result: T; events: ListingEvent[] }>): Promise<T> {
  const db = await getListingsDb("write");
  const out = await db.transaction(async (tx) => {
    const r = await fn(tx);
    if (r.events.length) await tx.insert(events).values(r.events.map((e) => ({ type: e.type, keys: e.keys, payload: ("payload" in e && e.payload) || {}, actor })));
    return r;
  });
  if (out.events.length) {
    const { project } = await import("./projector");
    await project(db);
    invalidate();
  }
  return out.result;
}

/** Forgets cached query results in this instance (the next query re-reads the version). */
export function invalidate() {
  const c = cache();
  c.entries.clear();
  c.checkedAt = 0;
}

/** Current read-model version; behind the event log means another instance wrote: catch up first. */
async function readVersion(): Promise<number> {
  const c = cache();
  if (Date.now() - c.checkedAt < VERSION_TTL_MS && c.version >= 0) return c.version;
  const db = await getListingsDb("read");
  const rows = (await db.execute(sql`
    select coalesce((select version from ${projectionState} where name = 'listings'), -1) as version,
           coalesce((select last_event_id from ${projectionState} where name = 'listings'), 0) as seen,
           coalesce((select max(id) from ${events}), 0) as latest`)) as unknown as { rows?: Record<string, unknown>[] } | Record<string, unknown>[];
  const row = (Array.isArray(rows) ? rows[0] : rows.rows?.[0]) ?? {};
  let version = Number(row.version ?? -1);
  if (Number(row.latest ?? 0) > Number(row.seen ?? 0) || version < 0) {
    const { project } = await import("./projector");
    version = await project(await getListingsDb("write"));
  }
  if (version !== c.version) c.entries.clear();
  c.version = version;
  c.checkedAt = Date.now();
  return version;
}

/** Runs a query against the read models, cached until the read models change. */
export async function query<T>(key: string, fn: (db: ListingsDB) => Promise<T>): Promise<T> {
  const c = cache();
  await readVersion();
  if (c.entries.has(key)) {
    const v = c.entries.get(key) as T;
    // Refresh LRU order.
    c.entries.delete(key);
    c.entries.set(key, v);
    return v;
  }
  const value = await fn(await getListingsDb("read"));
  c.entries.set(key, value);
  if (c.entries.size > CACHE_MAX) c.entries.delete(c.entries.keys().next().value!);
  return value;
}

/** Stable cache key for a query and its input (object keys sorted at every level). */
export const keyOf = (name: string, input: unknown) => `${name}:${stable(input)}`;
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}
