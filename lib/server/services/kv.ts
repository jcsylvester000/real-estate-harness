/** App-scoped key-value store (puter.kv): every app reads and writes only its own keys for the signed-in user. */
import { and, asc, eq, like } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { kv } from "@/lib/db/schema";
import { invalid } from "../errors";

export const KV_LIMITS = { maxKey: 200, maxValueBytes: 64 * 1024, maxKeysPerApp: 1000 };

const checkKey = (key: unknown) => {
  if (typeof key !== "string" || !key || key.length > KV_LIMITS.maxKey) throw invalid("Keys are 1-200 characters.");
  return key;
};

export async function kvGet(userId: string, appId: string, key: string) {
  const db = await getDb();
  const [r] = await db.select({ value: kv.value }).from(kv).where(and(eq(kv.userId, userId), eq(kv.appId, appId), eq(kv.key, checkKey(key))));
  return r?.value ?? null;
}

export async function kvSet(userId: string, appId: string, key: string, value: unknown) {
  const json = JSON.stringify(value ?? null);
  if (Buffer.byteLength(json) > KV_LIMITS.maxValueBytes) throw invalid("Values can be at most 64 KB.");
  const db = await getDb();
  const keys = await kvList(userId, appId);
  if (keys.length >= KV_LIMITS.maxKeysPerApp && !keys.includes(key)) throw invalid("This app has reached its 1,000 key limit.");
  await db
    .insert(kv)
    .values({ userId, appId, key: checkKey(key), value: value ?? null })
    .onConflictDoUpdate({ target: [kv.userId, kv.appId, kv.key], set: { value: value ?? null, updatedAt: new Date() } });
  return true;
}

export async function kvDel(userId: string, appId: string, key: string) {
  const db = await getDb();
  await db.delete(kv).where(and(eq(kv.userId, userId), eq(kv.appId, appId), eq(kv.key, checkKey(key))));
  return true;
}

export async function kvList(userId: string, appId: string, prefix = "") {
  const db = await getDb();
  const where = [eq(kv.userId, userId), eq(kv.appId, appId)];
  if (prefix) where.push(like(kv.key, `${prefix.replace(/[%_\\]/g, (c) => "\\" + c)}%`));
  const rows = await db.select({ key: kv.key }).from(kv).where(and(...where)).orderBy(asc(kv.key)).limit(KV_LIMITS.maxKeysPerApp);
  return rows.map((r) => r.key);
}
