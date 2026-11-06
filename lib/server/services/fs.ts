/**
 * Per-user virtual file system (Puter's puter.fs, simplified): absolute POSIX-style paths, folders and
 * small files stored in Postgres. Limits: 1 MB per file, 50 MB and 5,000 items per user.
 */
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { files } from "@/lib/db/schema";
import { invalid, notFound } from "../errors";

export const FS_LIMITS = { maxFileBytes: 1024 * 1024, maxUserBytes: 50 * 1024 * 1024, maxItems: 5000, maxPath: 512 };
export const DEFAULT_FOLDERS = ["/Desktop", "/Documents", "/Deals"];

export interface FsEntry {
  path: string;
  name: string;
  isDir: boolean;
  mime: string;
  size: number;
  updatedAt: string;
}

/** Normalizes "/a/./b/../c/" to "/a/c". Rejects control characters and over-long paths. */
export function normalizePath(input: string): string {
  if (typeof input !== "string" || !input.startsWith("/")) throw invalid("Paths start with /.");
  if (/[\u0000-\u001f\u007f\\]/.test(input)) throw invalid("The path has characters that are not allowed.");
  const parts: string[] = [];
  for (const seg of input.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg.trim());
  }
  if (parts.some((p) => !p || p.length > 120)) throw invalid("Each name must be 1-120 characters.");
  const out = "/" + parts.join("/");
  if (out.length > FS_LIMITS.maxPath) throw invalid("The path is too long.");
  return out;
}

const parentOf = (p: string) => (p.lastIndexOf("/") <= 0 ? "/" : p.slice(0, p.lastIndexOf("/")));
const nameOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);

const MIME: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".csv": "text/csv",
  ".html": "text/html",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
export const guessMime = (name: string) => MIME[name.slice(name.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream";

const toEntry = (r: typeof files.$inferSelect): FsEntry => ({
  path: r.path,
  name: r.name,
  isDir: r.isDir,
  mime: r.mime,
  size: r.size,
  updatedAt: r.updatedAt.toISOString(),
});

/** Creates the default folders for a user the first time their root is listed. */
async function ensureDefaults(userId: string) {
  const db = await getDb("write");
  await db
    .insert(files)
    .values(DEFAULT_FOLDERS.map((p) => ({ userId, path: p, parentPath: "/", name: nameOf(p), isDir: true, mime: "inode/directory" })))
    .onConflictDoNothing();
}

export async function list(userId: string, path: string): Promise<FsEntry[]> {
  const p = normalizePath(path);
  if (p === "/") await ensureDefaults(userId);
  else {
    const dir = await statRow(userId, p);
    if (!dir?.isDir) throw notFound("Folder");
  }
  const db = await getDb();
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.userId, userId), eq(files.parentPath, p)))
    .orderBy(desc(files.isDir), asc(sql`lower(${files.name})`))
    .limit(1000);
  return rows.map(toEntry);
}

async function statRow(userId: string, p: string) {
  const db = await getDb();
  const [r] = await db.select().from(files).where(and(eq(files.userId, userId), eq(files.path, p)));
  return r ?? null;
}

export async function stat(userId: string, path: string) {
  const r = await statRow(userId, normalizePath(path));
  if (!r) throw notFound("File");
  return toEntry(r);
}

export async function read(userId: string, path: string) {
  const r = await statRow(userId, normalizePath(path));
  if (!r || r.isDir) throw notFound("File");
  return { ...toEntry(r), encoding: r.encoding as "utf8" | "base64", content: r.content ?? "" };
}

async function usage(userId: string) {
  const db = await getDb();
  const [row] = await db.select({ bytes: sql<number>`coalesce(sum(${files.size}),0)::int`, n: sql<number>`count(*)::int` }).from(files).where(eq(files.userId, userId));
  return { bytes: row?.bytes ?? 0, items: row?.n ?? 0 };
}

async function requireParent(userId: string, p: string, createParents: boolean) {
  const parent = parentOf(p);
  if (parent === "/") return;
  const row = await statRow(userId, parent);
  if (row?.isDir) return;
  if (row) throw invalid(`${parent} is a file, not a folder.`);
  if (!createParents) throw notFound("Folder");
  await mkdir(userId, parent, true);
}

export async function mkdir(userId: string, path: string, createParents = false): Promise<FsEntry> {
  const p = normalizePath(path);
  if (p === "/") throw invalid("The root folder already exists.");
  const existing = await statRow(userId, p);
  if (existing) {
    if (existing.isDir) return toEntry(existing);
    throw invalid("A file with that name already exists.");
  }
  await requireParent(userId, p, createParents);
  if ((await usage(userId)).items >= FS_LIMITS.maxItems) throw invalid("You have reached the 5,000 item limit.");
  const db = await getDb();
  const [r] = await db
    .insert(files)
    .values({ userId, path: p, parentPath: parentOf(p), name: nameOf(p), isDir: true, mime: "inode/directory" })
    .onConflictDoNothing()
    .returning();
  return r ? toEntry(r) : toEntry((await statRow(userId, p))!);
}

export interface WriteInput {
  path: string;
  content: string;
  encoding?: "utf8" | "base64";
  mime?: string;
  /** false: fail if the file exists. Default true. */
  overwrite?: boolean;
  createParents?: boolean;
}

export async function write(userId: string, input: WriteInput): Promise<FsEntry> {
  const p = normalizePath(input.path);
  if (p === "/") throw invalid("Choose a file name.");
  const encoding = input.encoding ?? "utf8";
  if (typeof input.content !== "string") throw invalid("Content must be text (use base64 for binary files).");
  const size = encoding === "base64" ? Math.floor((input.content.replace(/=+$/, "").length * 3) / 4) : Buffer.byteLength(input.content, "utf8");
  if (size > FS_LIMITS.maxFileBytes) throw invalid("Files can be at most 1 MB in this version.");
  const existing = await statRow(userId, p);
  if (existing?.isDir) throw invalid("A folder with that name already exists.");
  if (existing && input.overwrite === false) throw invalid("A file with that name already exists.");
  const u = await usage(userId);
  if (u.bytes - (existing?.size ?? 0) + size > FS_LIMITS.maxUserBytes) throw invalid("Your 50 MB storage is full. Delete some files first.");
  if (!existing && u.items >= FS_LIMITS.maxItems) throw invalid("You have reached the 5,000 item limit.");
  await requireParent(userId, p, input.createParents ?? false);
  const mime = (input.mime && /^[\w.+-]+\/[\w.+-]+$/.test(input.mime) ? input.mime : null) ?? guessMime(p);
  const db = await getDb();
  const [r] = await db
    .insert(files)
    .values({ userId, path: p, parentPath: parentOf(p), name: nameOf(p), isDir: false, mime, encoding, content: input.content, size })
    .onConflictDoUpdate({ target: [files.userId, files.path], set: { content: input.content, encoding, mime, size, updatedAt: new Date() } })
    .returning();
  return toEntry(r!);
}

const under = (p: string) => `${p.replace(/[%_\\]/g, (c) => "\\" + c)}/%`;

export async function remove(userId: string, path: string) {
  const p = normalizePath(path);
  if (p === "/") throw invalid("The root folder cannot be deleted.");
  const db = await getDb();
  const rows = await db
    .delete(files)
    .where(and(eq(files.userId, userId), or(eq(files.path, p), like(files.path, under(p)))))
    .returning({ id: files.id });
  if (!rows.length) throw notFound("File");
  return { deleted: rows.length };
}

export async function rename(userId: string, from: string, to: string) {
  const a = normalizePath(from);
  const b = normalizePath(to);
  if (a === "/" || b === "/") throw invalid("The root folder cannot be moved.");
  if (b === a) return stat(userId, a);
  if (b.startsWith(a + "/")) throw invalid("A folder cannot be moved inside itself.");
  const src = await statRow(userId, a);
  if (!src) throw notFound("File");
  if (await statRow(userId, b)) throw invalid("Something with that name already exists.");
  await requireParent(userId, b, false);
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(files).set({ path: b, parentPath: parentOf(b), name: nameOf(b), updatedAt: new Date() }).where(eq(files.id, src.id));
    if (src.isDir) {
      // Re-root every descendant: replace the leading "a" with "b".
      await tx.execute(sql`
        update files set
          path = ${b} || substr(path, ${a.length + 1}),
          parent_path = ${b} || substr(parent_path, ${a.length + 1})
        where user_id = ${userId} and path like ${under(a)}`);
    }
  });
  return stat(userId, b);
}
