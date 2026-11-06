/**
 * Documents for the Query Engine (no AI).
 * WRITE: add (text already extracted in the browser: PDF text layer, DOCX, or OCR) → chunks + summary + facts, delete.
 * READ:  list, get, search (Postgres full-text over chunks, 'simple' dictionary so Filipino words match too),
 *        notes (text files the user keeps in Files, for "summarize my notes").
 * Only text is stored. The original file stays on the user's device.
 */
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { documentChunks, documents, files } from "@/lib/db/schema";
import { chunk, extractFacts, summarize, tokens, type DocFacts } from "@/lib/engine/text";
import { invalid, notFound } from "../errors";

export const DOC_LIMITS = { maxChars: 400_000, maxDocs: 200 };

export const docInput = z.object({
  name: z.string().trim().min(1).max(160),
  mime: z.string().max(120).default("text/plain"),
  method: z.enum(["pdf-text", "pdf-ocr", "docx", "image-ocr", "text"]),
  pages: z.array(z.object({ page: z.number().int().min(1), text: z.string() })).min(1).max(500),
  ocrConfidence: z.number().min(0).max(100).optional(),
});
export type DocInput = z.infer<typeof docInput>;

export interface DocSummary {
  id: string;
  name: string;
  method: string;
  pages: number;
  chars: number;
  ocrConfidence: number | null;
  summary: string;
  facts: DocFacts;
  createdAt: string;
}

const toSummary = (r: typeof documents.$inferSelect): DocSummary => ({
  id: r.id,
  name: r.name,
  method: r.method,
  pages: r.pages,
  chars: r.chars,
  ocrConfidence: r.ocrConfidence,
  summary: r.summary,
  facts: r.facts as unknown as DocFacts,
  createdAt: r.createdAt.toISOString(),
});

/** Cleans OCR and PDF text: joins hyphenated line breaks, drops repeated page headers and empty noise. */
export function cleanText(s: string) {
  return s
    .replace(/\u0000/g, "")
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function addDocument(userId: string, input: DocInput): Promise<DocSummary> {
  const pages = input.pages.map((p) => ({ page: p.page, text: cleanText(p.text) })).filter((p) => p.text.length > 0);
  const full = pages.map((p) => p.text).join("\n\n");
  if (full.length < 20) throw invalid("No readable text was found in that file. If it is a photo or scan, try a clearer image.");
  if (full.length > DOC_LIMITS.maxChars) throw invalid(`That document is too long (over ${DOC_LIMITS.maxChars.toLocaleString()} characters). Split it and upload the parts.`);
  const db = await getDb("write");
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(documents).where(eq(documents.userId, userId))) as [{ n: number }];
  if (n >= DOC_LIMITS.maxDocs) throw invalid(`You can keep up to ${DOC_LIMITS.maxDocs} documents. Delete some first.`);

  const summary = summarize(full, 5).join(" ");
  const facts = extractFacts(full);
  return db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({ userId, name: input.name, mime: input.mime, method: input.method, pages: input.pages.length, chars: full.length, ocrConfidence: input.ocrConfidence === undefined ? null : Math.round(input.ocrConfidence), summary, facts: facts as unknown as Record<string, unknown> })
      .returning();
    let seq = 0;
    const rows = pages.flatMap((p) => chunk(p.text).map((text) => ({ documentId: doc!.id, userId, seq: seq++, page: p.page, text })));
    for (let i = 0; i < rows.length; i += 200) await tx.insert(documentChunks).values(rows.slice(i, i + 200));
    return toSummary(doc!);
  });
}

export async function listDocuments(userId: string): Promise<DocSummary[]> {
  const db = await getDb();
  const rows = await db.select().from(documents).where(eq(documents.userId, userId)).orderBy(desc(documents.createdAt)).limit(DOC_LIMITS.maxDocs);
  return rows.map(toSummary);
}

export async function getDocument(userId: string, id: string, withText = false) {
  const db = await getDb();
  const [r] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
  if (!r) throw notFound("Document");
  const out: DocSummary & { text?: string } = toSummary(r);
  if (withText) {
    const cs = await db.select({ text: documentChunks.text }).from(documentChunks).where(eq(documentChunks.documentId, id)).orderBy(documentChunks.seq);
    out.text = cs.map((c) => c.text).join("\n\n");
  }
  return out;
}

export async function deleteDocument(userId: string, id: string) {
  const db = await getDb("write");
  const r = await db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, userId))).returning({ id: documents.id });
  if (!r.length) throw notFound("Document");
  return true;
}

export interface Passage {
  documentId: string;
  name: string;
  page: number | null;
  text: string;
  rank: number;
}

/** Full-text search over the user's document passages (any word matches; rarer words rank higher). */
export async function searchDocuments(userId: string, q: string, opts: { documentIds?: string[]; limit?: number } = {}): Promise<Passage[]> {
  const words = [...new Set(tokens(q).filter((w) => w.length > 1 && /^[a-z0-9]+$/.test(w)))].slice(0, 12);
  if (!words.length) return [];
  // Prefix match per stem (stems are shortened words, e.g. "penalt" matches "penalty" and "penalties").
  const tsq = words.map((w) => `${w}:*`).join(" | ");
  const db = await getDb();
  const conds = [eq(documentChunks.userId, userId), sql`${documentChunks.search} @@ to_tsquery('simple', ${tsq})`];
  if (opts.documentIds?.length) conds.push(inArray(documentChunks.documentId, opts.documentIds));
  const rows = await db
    .select({ documentId: documentChunks.documentId, name: documents.name, page: documentChunks.page, text: documentChunks.text, rank: sql<number>`ts_rank(${documentChunks.search}, to_tsquery('simple', ${tsq}))` })
    .from(documentChunks)
    .innerJoin(documents, eq(documents.id, documentChunks.documentId))
    .where(and(...conds))
    .orderBy(sql`5 desc`)
    .limit(opts.limit ?? 8);
  return rows.map((r) => ({ ...r, rank: Number(r.rank) }));
}

/** Text notes the user keeps in Files (Notes app saves .md/.txt), newest first. */
export async function recentNotes(userId: string, limit = 10) {
  const db = await getDb();
  const rows = await db
    .select({ path: files.path, name: files.name, content: files.content, updatedAt: files.updatedAt })
    .from(files)
    .where(and(eq(files.userId, userId), eq(files.isDir, false), eq(files.encoding, "utf8"), or(like(files.name, "%.md"), like(files.name, "%.txt"))))
    .orderBy(desc(files.updatedAt))
    .limit(limit);
  return rows.map((r) => ({ path: r.path, name: r.name, content: r.content ?? "", updatedAt: r.updatedAt.toISOString() }));
}
