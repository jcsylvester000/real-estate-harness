/**
 * Property Teaser projects and images.
 *  - Projects: one JSON design per deck or trailer (validated loosely: the editor owns the shape).
 *  - Assets: images the browser has already resized to JPEG/PNG/WebP (SVG is rasterized client-side, so no
 *    script-capable files are stored). Served by /api/teaser-assets/<id> to the owner only.
 *  - Web images: Openverse search (Creative Commons, no key) and import by link, fetched server-side with
 *    private-network blocking, size and type limits, and a credit line kept with the image.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { teaserAssets, teaserTemplates, teasers, usageEvents } from "@/lib/db/schema";
import { estimateCostUsd, harnessConfig } from "@/lib/harness";
import { invalid, notFound, DriverError } from "../errors";
import { anyKeyProvider } from "./ai-keys";

export const TEASER_LIMITS = { maxProjects: 300, maxDataBytes: 2_500_000, maxAssetBytes: 4_500_000, maxWebBytes: 8_000_000, maxAssets: 1500, maxTemplates: 60 };
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// ---------------------------------------------------------------- projects

export const teaserInput = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["deck", "trailer"]),
  title: z.string().trim().min(1).max(120),
  templateId: z.string().max(60),
  data: z.record(z.string(), z.unknown()),
  thumb: z
    .string()
    .max(200_000)
    .regex(/^(data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)?$/)
    .default(""),
});

export async function listTeasers(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: teasers.id, kind: teasers.kind, title: teasers.title, templateId: teasers.templateId, thumb: teasers.thumb, updatedAt: teasers.updatedAt })
    .from(teasers)
    .where(eq(teasers.userId, userId))
    .orderBy(desc(teasers.updatedAt))
    .limit(TEASER_LIMITS.maxProjects);
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function getTeaser(userId: string, id: string) {
  const db = await getDb();
  const [r] = await db.select().from(teasers).where(and(eq(teasers.id, id), eq(teasers.userId, userId)));
  if (!r) throw notFound("Project");
  return { id: r.id, kind: r.kind, title: r.title, templateId: r.templateId, data: r.data, updatedAt: r.updatedAt.toISOString() };
}

export async function saveTeaser(userId: string, input: z.infer<typeof teaserInput>) {
  if (JSON.stringify(input.data).length > TEASER_LIMITS.maxDataBytes) throw invalid("This design is too large to save. Remove some slides or images.");
  const db = await getDb("write");
  const values = { kind: input.kind, title: input.title, templateId: input.templateId, data: input.data, thumb: input.thumb, updatedAt: new Date() };
  if (input.id) {
    const r = await db.update(teasers).set(values).where(and(eq(teasers.id, input.id), eq(teasers.userId, userId))).returning({ id: teasers.id, updatedAt: teasers.updatedAt });
    if (!r.length) throw notFound("Project");
    return { id: r[0]!.id, updatedAt: r[0]!.updatedAt.toISOString() };
  }
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(teasers).where(eq(teasers.userId, userId))) as [{ n: number }];
  if (n >= TEASER_LIMITS.maxProjects) throw invalid(`You can keep up to ${TEASER_LIMITS.maxProjects} projects. Delete some first.`);
  const [r] = await db.insert(teasers).values({ userId, ...values }).returning({ id: teasers.id, updatedAt: teasers.updatedAt });
  return { id: r!.id, updatedAt: r!.updatedAt.toISOString() };
}

export async function deleteTeaser(userId: string, id: string) {
  const db = await getDb("write");
  const r = await db.delete(teasers).where(and(eq(teasers.id, id), eq(teasers.userId, userId))).returning({ id: teasers.id });
  if (!r.length) throw notFound("Project");
  return true;
}

export async function duplicateTeaser(userId: string, id: string) {
  const t = await getTeaser(userId, id);
  const db = await getDb();
  const [row] = await db.select({ thumb: teasers.thumb }).from(teasers).where(eq(teasers.id, id));
  return saveTeaser(userId, { kind: t.kind as "deck" | "trailer", title: `${t.title} (copy)`.slice(0, 120), templateId: t.templateId, data: t.data, thumb: row?.thumb ?? "" });
}

// ---------------------------------------------------------------- saved designs ("my templates")

export const templateInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["deck", "trailer"]),
  data: z.record(z.string(), z.unknown()),
  thumb: teaserInput.shape.thumb,
});

export async function listTemplates(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: teaserTemplates.id, name: teaserTemplates.name, kind: teaserTemplates.kind, thumb: teaserTemplates.thumb, updatedAt: teaserTemplates.updatedAt })
    .from(teaserTemplates)
    .where(eq(teaserTemplates.userId, userId))
    .orderBy(desc(teaserTemplates.updatedAt))
    .limit(TEASER_LIMITS.maxTemplates);
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function getTemplate(userId: string, id: string) {
  const db = await getDb();
  const [r] = await db.select().from(teaserTemplates).where(and(eq(teaserTemplates.id, id), eq(teaserTemplates.userId, userId)));
  if (!r) throw notFound("Design");
  return { id: r.id, name: r.name, kind: r.kind, data: r.data, updatedAt: r.updatedAt.toISOString() };
}

export async function saveTemplate(userId: string, input: z.infer<typeof templateInput>) {
  if (JSON.stringify(input.data).length > TEASER_LIMITS.maxDataBytes) throw invalid("This design is too large to save.");
  const db = await getDb("write");
  const values = { name: input.name, kind: input.kind, data: input.data, thumb: input.thumb, updatedAt: new Date() };
  if (input.id) {
    const r = await db.update(teaserTemplates).set(values).where(and(eq(teaserTemplates.id, input.id), eq(teaserTemplates.userId, userId))).returning({ id: teaserTemplates.id });
    if (!r.length) throw notFound("Design");
    return { id: r[0]!.id };
  }
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(teaserTemplates).where(eq(teaserTemplates.userId, userId))) as [{ n: number }];
  if (n >= TEASER_LIMITS.maxTemplates) throw invalid(`You can keep up to ${TEASER_LIMITS.maxTemplates} saved designs. Delete some first.`);
  const [r] = await db.insert(teaserTemplates).values({ userId, ...values }).returning({ id: teaserTemplates.id });
  return { id: r!.id };
}

export async function deleteTemplate(userId: string, id: string) {
  const db = await getDb("write");
  const r = await db.delete(teaserTemplates).where(and(eq(teaserTemplates.id, id), eq(teaserTemplates.userId, userId))).returning({ id: teaserTemplates.id });
  if (!r.length) throw notFound("Design");
  return true;
}

// ---------------------------------------------------------------- assets

export const assetInput = z.object({
  /** data:image/...;base64,... */
  dataUrl: z.string().max(6_200_000),
  width: z.number().int().min(1).max(20000).optional(),
  height: z.number().int().min(1).max(20000).optional(),
  source: z.enum(["upload", "logo"]).default("upload"),
  name: z.string().trim().max(160).default(""),
});

function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  return null;
}

async function storeAsset(userId: string, buf: Buffer, meta: { width?: number; height?: number; source: string; name: string; credit?: string; sourceUrl?: string }) {
  const mime = sniff(buf);
  if (!mime || !IMAGE_TYPES.includes(mime)) throw invalid("Only JPEG, PNG, WebP or GIF images can be used.");
  const db = await getDb("write");
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(teaserAssets).where(eq(teaserAssets.userId, userId))) as [{ n: number }];
  if (n >= TEASER_LIMITS.maxAssets) throw invalid("Your image library is full. Delete some images first.");
  const [r] = await db
    .insert(teaserAssets)
    .values({ userId, mime, data: buf.toString("base64"), bytes: buf.length, width: meta.width ?? null, height: meta.height ?? null, source: meta.source, name: meta.name.slice(0, 160), credit: (meta.credit ?? "").slice(0, 400), sourceUrl: (meta.sourceUrl ?? "").slice(0, 600) })
    .returning({ id: teaserAssets.id, createdAt: teaserAssets.createdAt });
  return { id: r!.id, src: `asset:${r!.id}`, mime, bytes: buf.length, width: meta.width ?? null, height: meta.height ?? null, source: meta.source, name: meta.name, credit: meta.credit ?? "", createdAt: r!.createdAt.toISOString() };
}

export async function addAsset(userId: string, input: z.infer<typeof assetInput>) {
  const m = input.dataUrl.match(/^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw invalid("Upload a JPEG, PNG or WebP image.");
  const buf = Buffer.from(m[2]!, "base64");
  if (buf.length > TEASER_LIMITS.maxAssetBytes) throw invalid("That image is too large (4.5 MB max after resizing).");
  return storeAsset(userId, buf, { ...input });
}

export async function listAssets(userId: string, source?: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: teaserAssets.id, mime: teaserAssets.mime, bytes: teaserAssets.bytes, width: teaserAssets.width, height: teaserAssets.height, source: teaserAssets.source, name: teaserAssets.name, credit: teaserAssets.credit, createdAt: teaserAssets.createdAt })
    .from(teaserAssets)
    .where(source ? and(eq(teaserAssets.userId, userId), eq(teaserAssets.source, source)) : eq(teaserAssets.userId, userId))
    .orderBy(desc(teaserAssets.createdAt))
    .limit(200);
  return rows.map((r) => ({ ...r, src: `asset:${r.id}`, createdAt: r.createdAt.toISOString() }));
}

export async function readAsset(userId: string, id: string) {
  const db = await getDb();
  const [r] = await db.select({ mime: teaserAssets.mime, data: teaserAssets.data }).from(teaserAssets).where(and(eq(teaserAssets.id, id), eq(teaserAssets.userId, userId)));
  return r ? { mime: r.mime, body: Buffer.from(r.data, "base64") } : null;
}

export async function deleteAsset(userId: string, id: string) {
  const db = await getDb("write");
  const r = await db.delete(teaserAssets).where(and(eq(teaserAssets.id, id), eq(teaserAssets.userId, userId))).returning({ id: teaserAssets.id });
  if (!r.length) throw notFound("Image");
  return true;
}

// ---------------------------------------------------------------- web images

/** Private, loopback, link-local and other non-public addresses (IPv4 and IPv6). */
export function isPrivateAddress(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  if (x.startsWith("::ffff:")) return isPrivateAddress(x.slice(7));
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("ff");
}

type Fetcher = typeof fetch;
let fetcher: Fetcher = (...a) => fetch(...a);
let resolver = async (host: string) => (await lookup(host, { all: true })).map((r) => r.address);
/** Tests swap the network out. */
export function setWebImpl(f: Fetcher, r?: (host: string) => Promise<string[]>) {
  fetcher = f;
  if (r) resolver = r;
}

async function safeFetch(rawUrl: string, maxBytes: number, accept: string) {
  let url = rawUrl;
  for (let hop = 0; hop < 4; hop++) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw invalid("That is not a valid link.");
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") throw invalid("Only http and https links can be imported.");
    if (u.username || u.password) throw invalid("Links with a user name or password are not allowed.");
    const host = u.hostname.replace(/^\[|\]$/g, "");
    const addrs = isIP(host) ? [host] : await resolver(host).catch(() => []);
    if (!addrs.length) throw invalid("That website could not be found.");
    if (addrs.some(isPrivateAddress)) throw invalid("Links to private or local network addresses are not allowed.");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    let res: Response;
    try {
      res = await fetcher(u.toString(), { redirect: "manual", signal: ctrl.signal, headers: { accept, "user-agent": "GridAgentic-PropertyTeaser/1.0" } });
    } catch {
      clearTimeout(timer);
      throw invalid("Could not download that image (the site did not answer).");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      clearTimeout(timer);
      url = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    if (!res.ok) {
      clearTimeout(timer);
      throw invalid(`The site refused the download (HTTP ${res.status}).`);
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) {
      clearTimeout(timer);
      throw invalid(`That file is too large (${Math.round(maxBytes / 1e6)} MB max).`);
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) {
          ctrl.abort();
          clearTimeout(timer);
          throw invalid(`That file is too large (${Math.round(maxBytes / 1e6)} MB max).`);
        }
        chunks.push(value);
      }
    clearTimeout(timer);
    return { buf: Buffer.concat(chunks), type: res.headers.get("content-type") ?? "", finalUrl: u.toString() };
  }
  throw invalid("Too many redirects.");
}

export const importInput = z.object({ url: z.string().trim().min(8).max(2000), credit: z.string().trim().max(400).default(""), name: z.string().trim().max(160).default("") });

export async function importFromUrl(userId: string, input: z.infer<typeof importInput>) {
  const { buf, finalUrl } = await safeFetch(input.url, TEASER_LIMITS.maxWebBytes, "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9");
  if (!sniff(buf)) throw invalid("That link is not a JPEG, PNG, WebP or GIF image. Open the picture itself and copy its address.");
  const name = input.name || decodeURIComponent(new URL(finalUrl).pathname.split("/").pop() ?? "").slice(0, 120) || "Web image";
  return storeAsset(userId, buf, { source: "web", name, credit: input.credit || `Image from ${new URL(finalUrl).hostname}`, sourceUrl: finalUrl });
}

export interface WebImage {
  id: string;
  title: string;
  creator: string;
  license: string;
  url: string;
  landing: string;
  thumb: string;
  width: number | null;
  height: number | null;
  credit: string;
}

/** Openverse (openverse.org): Creative Commons images that allow commercial use. No API key needed. */
export async function searchWebImages(q: string, page = 1): Promise<{ results: WebImage[]; total: number }> {
  const query = q.trim().slice(0, 120);
  if (!query) return { results: [], total: 0 };
  const api = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page=${page}&page_size=20&license_type=commercial&mature=false`;
  let data: { result_count?: number; results?: Record<string, unknown>[] };
  try {
    const { buf } = await safeFetch(api, 2_000_000, "application/json");
    data = JSON.parse(buf.toString("utf8"));
  } catch (e) {
    throw new DriverError("web_unavailable", e instanceof DriverError ? `Image search is unavailable: ${e.message}` : "Image search is unavailable right now. Try again, or paste an image link.", 502);
  }
  const rows = (data.results ?? []).slice(0, 20);
  const results = await Promise.all(
    rows.map(async (r): Promise<WebImage | null> => {
      const id = String(r.id ?? "");
      const lic = `${String(r.license ?? "").toUpperCase()} ${String(r.license_version ?? "")}`.trim();
      const title = String(r.title ?? "Untitled").slice(0, 120);
      const creator = String(r.creator ?? "Unknown").slice(0, 80);
      try {
        // Thumbnails come through the server so the page needs no outside image sources.
        const { buf } = await safeFetch(String(r.thumbnail ?? `https://api.openverse.org/v1/images/${id}/thumb/`), 400_000, "image/*");
        const mime = sniff(buf);
        if (!mime) return null;
        return { id, title, creator, license: lic, url: String(r.url ?? ""), landing: String(r.foreign_landing_url ?? ""), thumb: `data:${mime};base64,${buf.toString("base64")}`, width: Number(r.width) || null, height: Number(r.height) || null, credit: `“${title}” by ${creator}, ${lic} (via Openverse)` };
      } catch {
        return null;
      }
    }),
  );
  return { results: results.filter((x): x is WebImage => !!x), total: Number(data.result_count ?? 0) };
}

// ---------------------------------------------------------------- Polish with AI (only with the person's own key)

export const polishInput = z.object({ text: z.string().max(8000), details: z.record(z.string(), z.unknown()).default({}) });

export async function polishWithAi(userId: string, input: z.infer<typeof polishInput>) {
  const p = await anyKeyProvider(userId);
  if (!p) throw new DriverError("provider_not_configured", "Add your own AI key in Settings → AI setup to use Polish with AI. Write it for me works without AI.", 400);
  const system =
    "You write property marketing copy for Philippine real estate brokers. Use only facts in the input; never invent prices, sizes, amenities or distances. Plain, warm English. Return only JSON: {\"taglines\": [3 strings, max 9 words], \"short\": string (max 60 words), \"long\": string (max 120 words), \"highlights\": [up to 6 strings, max 8 words each]}.";
  const user = `Details: ${JSON.stringify(input.details).slice(0, 2000)}\n\nNotes:\n${input.text.slice(0, 6000)}`;
  const r = await p.provider.complete({ system, messages: [{ role: "user", content: user }], tools: [], maxOutputTokens: 700, temperature: 0.5 });
  const json = r.text.match(/\{[\s\S]*\}/)?.[0];
  let out: { taglines?: unknown; short?: unknown; long?: unknown; highlights?: unknown };
  try {
    out = JSON.parse(json ?? "{}");
  } catch {
    throw invalid("The AI answer could not be read. Try again.");
  }
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 200)).slice(0, n) : []);
  const usd = r.costUsd ?? estimateCostUsd(p.provider.model, r.usage) ?? 0;
  const db = await getDb("write");
  await db.insert(usageEvents).values({ userId, appId: "property-teaser", provider: p.provider.id, model: p.provider.model, inputTokens: r.usage.inputTokens, cachedInputTokens: r.usage.cachedInputTokens, outputTokens: r.usage.outputTokens, steps: 1, tools: [], costUsd: String(usd), costPhp: String(Math.round(usd * harnessConfig().usdToPhp * 100) / 100) });
  return { taglines: strs(out.taglines, 3), short: typeof out.short === "string" ? out.short.slice(0, 800) : "", long: typeof out.long === "string" ? out.long.slice(0, 1500) : "", highlights: strs(out.highlights, 6), provider: p.label, model: p.provider.model };
}
