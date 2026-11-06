import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { providerList } from "@/lib/server/services/ai";

export const dynamic = "force-dynamic";

/** Liveness + setup check. Reports yes/no only, never values. */
export async function GET() {
  let db = false;
  try {
    await (await getDb()).execute(sql`select 1`);
    db = true;
  } catch {
    db = false;
  }
  const providers = Object.fromEntries(providerList().map((p) => [p.id, p.configured]));
  return NextResponse.json({ ok: db, db, providers, appSecret: (process.env.APP_SECRET ?? "").length >= 32 }, { status: db ? 200 : 503, headers: { "cache-control": "no-store" } });
}
