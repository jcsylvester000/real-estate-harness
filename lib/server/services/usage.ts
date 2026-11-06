/** AI usage and cost reports from usage_events. */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { usageEvents, users } from "@/lib/db/schema";
import { harnessConfig } from "@/lib/harness";
import { manilaDayStart } from "./ai";

const sum = (c: typeof usageEvents.costPhp) => sql<string>`coalesce(sum(${c}), 0)`;

export async function myUsage(userId: string) {
  const db = await getDb();
  const since30 = new Date(manilaDayStart().getTime() - 29 * 86400_000);
  const [today] = await db
    .select({ turns: sql<number>`count(*)::int`, php: sum(usageEvents.costPhp) })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), gte(usageEvents.createdAt, manilaDayStart())));
  const byModel = await db
    .select({ provider: usageEvents.provider, model: usageEvents.model, turns: sql<number>`count(*)::int`, php: sum(usageEvents.costPhp) })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), gte(usageEvents.createdAt, since30)))
    .groupBy(usageEvents.provider, usageEvents.model)
    .orderBy(desc(sum(usageEvents.costPhp)));
  const recent = await db
    .select({
      createdAt: usageEvents.createdAt,
      appId: usageEvents.appId,
      model: usageEvents.model,
      tools: usageEvents.tools,
      inputTokens: usageEvents.inputTokens,
      outputTokens: usageEvents.outputTokens,
      php: usageEvents.costPhp,
    })
    .from(usageEvents)
    .where(eq(usageEvents.userId, userId))
    .orderBy(desc(usageEvents.createdAt))
    .limit(20);
  return {
    dailyCapPhp: harnessConfig().limits.dailyCapPhp,
    today: { turns: today?.turns ?? 0, php: Number(today?.php ?? 0) },
    last30Days: byModel.map((r) => ({ ...r, php: Number(r.php) })),
    recent: recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), php: Number(r.php) })),
  };
}

export async function allUsage() {
  const db = await getDb();
  const since30 = new Date(manilaDayStart().getTime() - 29 * 86400_000);
  const rows = await db
    .select({
      username: users.username,
      displayName: users.displayName,
      turns: sql<number>`count(*)::int`,
      php: sum(usageEvents.costPhp),
      today: sql<string>`coalesce(sum(${usageEvents.costPhp}) filter (where ${usageEvents.createdAt} >= ${manilaDayStart()}), 0)`,
    })
    .from(usageEvents)
    .innerJoin(users, eq(users.id, usageEvents.userId))
    .where(gte(usageEvents.createdAt, since30))
    .groupBy(users.username, users.displayName)
    .orderBy(desc(sum(usageEvents.costPhp)))
    .limit(200);
  return rows.map((r) => ({ ...r, php: Number(r.php), today: Number(r.today) }));
}
