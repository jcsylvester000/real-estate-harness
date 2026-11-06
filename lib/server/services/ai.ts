/**
 * The AI driver service: runs the PH Real Estate Harness for a user and app.
 * Adds what the standalone harness left for production: Postgres conversation memory, the listings table
 * as the inventory source, metering of every turn, and a per-user daily peso cap (Puter-style usage limits).
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  RealEstateHarness,
  createProvider,
  harnessConfig,
  type ChatMessage,
  type HarnessTurnResult,
  type ModelTier,
  type ProviderId,
  type SessionStore,
} from "@/lib/harness";
import { getDb } from "@/lib/db/client";
import { chatSessions, usageEvents } from "@/lib/db/schema";
import "./listings"; // registers the listings index as the harness inventory
import "./lenders"; // registers the editable lender rates for compare_mortgage_lenders
import { clearEngineState, engineTurn } from "./engine";
import { DriverError, invalid, notFound } from "../errors";


export const MAX_MESSAGE_CHARS = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Conversation memory scoped to one user and app: a session id from another user is treated as unknown. */
export class PgSessionStore implements SessionStore {
  constructor(
    private readonly userId: string,
    private readonly appId: string,
    private readonly title = "New conversation",
  ) {}

  async get(sessionId: string): Promise<ChatMessage[]> {
    if (!UUID.test(sessionId)) return [];
    const db = await getDb();
    const [r] = await db
      .select({ messages: chatSessions.messages })
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, this.userId), eq(chatSessions.appId, this.appId)));
    return (r?.messages as ChatMessage[]) ?? [];
  }

  async save(sessionId: string, messages: ChatMessage[]): Promise<void> {
    const db = await getDb();
    await db
      .insert(chatSessions)
      .values({ id: sessionId, userId: this.userId, appId: this.appId, title: this.title, messages })
      .onConflictDoUpdate({
        target: chatSessions.id,
        set: { messages, updatedAt: new Date() },
        // Never let one user's write land on another user's conversation.
        setWhere: and(eq(chatSessions.userId, this.userId), eq(chatSessions.appId, this.appId)),
      });
  }

  async clear(sessionId: string): Promise<void> {
    if (!UUID.test(sessionId)) return;
    const db = await getDb();
    await db.delete(chatSessions).where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, this.userId)));
  }
}

/** Start of today in Asia/Manila (UTC+8, no daylight saving), as a UTC Date. */
export function manilaDayStart(now = new Date()) {
  const shifted = new Date(now.getTime() + 8 * 3600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 8 * 3600_000);
}

export async function spentTodayPhp(userId: string) {
  const db = await getDb();
  const [r] = await db
    .select({ php: sql<string>`coalesce(sum(${usageEvents.costPhp}), 0)` })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), gte(usageEvents.createdAt, manilaDayStart())));
  return Number(r?.php ?? 0);
}

/** Whether a real AI model is set up (the Demo provider does not count). */
export function aiStatus() {
  const list = providerList();
  const real = list.filter((p) => p.id !== "demo" && p.configured);
  return { realAi: real.length > 0, demo: list.some((p) => p.id === "demo" && p.configured), providers: list.map(({ id, label, configured }) => ({ id, label, configured })) };
}

export function providerList() {
  const cfg = harnessConfig();
  return (Object.keys(cfg.providers) as ProviderId[])
    .filter((id) => id !== "demo" || cfg.demoEnabled)
    .map((id) => ({
      id,
      label: { anthropic: "Claude", openai: cfg.openaiLabel, gemini: "Gemini", demo: "Query Engine (no AI)" }[id],
      configured: id === "demo" ? cfg.demoEnabled : Boolean(cfg.providers[id].apiKey),
      models: cfg.providers[id].models,
      isDefault: id === cfg.defaultProvider,
    }));
}

/** Picks the requested provider, else the default when it has a key, else the first configured one. */
function pickProvider(requested?: string): ProviderId {
  const list = providerList();
  if (requested) {
    const p = list.find((x) => x.id === requested);
    if (!p) throw invalid(`Unknown AI provider "${requested}".`);
    if (!p.configured) throw new DriverError("provider_not_configured", `${p.label} has no API key yet. Add it to the server environment, or pick another provider.`, 400);
    return p.id;
  }
  const def = list.find((x) => x.isDefault && x.configured) ?? list.find((x) => x.configured);
  if (!def) throw new DriverError("provider_not_configured", "No AI provider is set up. Add an API key to the server environment.", 400);
  return def.id;
}

export interface ChatInput {
  message: string;
  sessionId?: string;
  provider?: string;
  tier?: ModelTier;
}

export type ChatOutput = HarnessTurnResult & { spentTodayPhp: number; dailyCapPhp: number };

export async function chat(userId: string, appId: string, input: ChatInput): Promise<ChatOutput> {
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) throw invalid("Type a message first.");
  if (message.length > MAX_MESSAGE_CHARS) throw invalid(`Messages can be at most ${MAX_MESSAGE_CHARS} characters.`);
  const cfg = harnessConfig();
  const providerId = pickProvider(input.provider);
  const tier: ModelTier = input.tier === "budget" ? "budget" : "balanced";

  // No-AI Query Engine: rule-based, free, no daily cap.
  if (providerId === "demo") {
    const sid = input.sessionId && UUID.test(input.sessionId) ? input.sessionId : crypto.randomUUID();
    const turn = await engineTurn(userId, appId, message, sid, new PgSessionStore(userId, appId, message.slice(0, 60)));
    // Metered at zero cost so the Usage tab counts engine turns too.
    await (await getDb("write")).insert(usageEvents).values({ userId, appId, sessionId: sid, provider: "demo", model: turn.model, steps: turn.steps, tools: turn.toolTrace.map((t) => t.name), costUsd: "0", costPhp: "0" });
    return { ...turn, spentTodayPhp: await spentTodayPhp(userId), dailyCapPhp: cfg.limits.dailyCapPhp };
  }

  const before = await spentTodayPhp(userId);
  if (cfg.limits.dailyCapPhp > 0 && before >= cfg.limits.dailyCapPhp)
    throw new DriverError("daily_cap_reached", `You have used today's AI allowance (₱${cfg.limits.dailyCapPhp}). It resets at midnight Manila time; calculators still work.`, 429);

  const provider = createProvider(providerId, cfg.providers[providerId], tier, undefined, { timeoutMs: cfg.limits.providerTimeoutMs, retries: 1 });
  const sessionId = input.sessionId && UUID.test(input.sessionId) ? input.sessionId : crypto.randomUUID();
  const harness = new RealEstateHarness({
    sessions: new PgSessionStore(userId, appId, message.slice(0, 60)),
    prompt: { brokerageName: cfg.brokerageName },
    maxToolSteps: cfg.limits.maxToolSteps,
    maxOutputTokens: cfg.limits.maxOutputTokens,
    maxCostPerTurnUsd: cfg.limits.maxCostPerTurnUsd,
    historyTurns: cfg.limits.historyTurns,
    usdToPhp: cfg.usdToPhp,
  });
  const turn = await harness.chat(provider, message, sessionId);

  const db = await getDb();
  await db.insert(usageEvents).values({
    userId,
    appId,
    sessionId: turn.sessionId,
    provider: turn.provider,
    model: turn.model,
    inputTokens: turn.usage.inputTokens,
    cachedInputTokens: turn.usage.cachedInputTokens,
    outputTokens: turn.usage.outputTokens,
    steps: turn.steps,
    tools: turn.toolTrace.map((t) => t.name),
    costUsd: String(turn.estimatedCostUsd ?? 0),
    costPhp: String(turn.estimatedCostPhp ?? 0),
  });
  return { ...turn, spentTodayPhp: Math.round((before + (turn.estimatedCostPhp ?? 0)) * 100) / 100, dailyCapPhp: cfg.limits.dailyCapPhp };
}

export async function listSessions(userId: string, appId: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: chatSessions.id, title: chatSessions.title, updatedAt: chatSessions.updatedAt })
    .from(chatSessions)
    .where(and(eq(chatSessions.userId, userId), eq(chatSessions.appId, appId)))
    .orderBy(desc(chatSessions.updatedAt))
    .limit(50);
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

/** Past conversation as the user saw it: user and assistant text only (tool exchanges stay server-side). */
export async function getSession(userId: string, appId: string, sessionId: string) {
  const msgs = await new PgSessionStore(userId, appId).get(sessionId);
  if (!msgs.length) throw notFound("Conversation");
  return {
    id: sessionId,
    messages: msgs
      .filter((m): m is Extract<ChatMessage, { role: "user" | "assistant" }> => (m.role === "user" || m.role === "assistant") && !!m.content)
      .map((m) => ({ role: m.role, content: m.content })),
  };
}

export async function deleteSession(userId: string, appId: string, sessionId: string) {
  await new PgSessionStore(userId, appId).clear(sessionId);
  if (UUID.test(sessionId)) await clearEngineState(userId, appId, sessionId);
  return true;
}
