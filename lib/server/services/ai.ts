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
import { MINE, listKeys, resolveKey } from "./ai-keys";
import { DriverError, invalid, notFound } from "../errors";
import { kvDel, kvGet, kvSet } from "./kv";
import { ToolRegistry, DEFAULT_TOOLS } from "@/lib/harness";
import { appTools, type AppAction, type AppBridge } from "@/lib/agent/app-tools";
import { SourceLedger, type Source } from "@/lib/research/ledger";
import { agentPrompt, researchPrompt } from "@/lib/research/prompt";
import { researchTools } from "@/lib/research/tools";
import { searchBackend } from "@/lib/research/search";

/** Harness modes. "agent" works in Grid's apps; "research" researches PH real estate on the web with sources. Both need an AI key. */
export const MODES = ["agent", "research"] as const;
export type Mode = (typeof MODES)[number];
const envNum = (k: string, d: number) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/** Saved history keeps tool results short, so follow-up turns do not resend whole web pages. */
class CompactStore implements SessionStore {
  constructor(private inner: SessionStore) {}
  get(id: string) {
    return this.inner.get(id);
  }
  clear(id: string) {
    return this.inner.clear(id);
  }
  save(id: string, messages: ChatMessage[]) {
    return this.inner.save(id, messages.map((m) => (m.role === "tool" && m.content.length > 1500 ? { ...m, content: `${m.content.slice(0, 1500)}…(cut)` } : m)));
  }
}

export interface SourceOut extends Source {
  cited: boolean;
}


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

/** Whether a real AI model is available to this person (their own key, or a team key on the server). */
/** Which web search the Research harness uses (shown in Settings). */
export const researchStatus = () => ({ search: searchBackend() });

export async function aiStatus(userId?: string) {
  const list = await providerList(userId);
  const real = list.filter((p) => p.id !== "demo" && p.configured);
  return { realAi: real.length > 0, demo: list.some((p) => p.id === "demo" && p.configured), providers: list.map(({ id, label, configured }) => ({ id, label, configured })), researchSearch: searchBackend() };
}

export interface ProviderOption {
  id: string;
  label: string;
  configured: boolean;
  models: Record<ModelTier, string>;
  /** Grid Agentic defaults to no AI: the Query Engine is the default whenever it is enabled. */
  isDefault: boolean;
  /** "engine" (no AI) · "mine" (the person's own key) · "team" (server key) */
  source: "engine" | "mine" | "team";
}

/** Query Engine first (the default), then the person's own keys, then any team keys set on the server. */
export async function providerList(userId?: string): Promise<ProviderOption[]> {
  const cfg = harnessConfig();
  const out: ProviderOption[] = [];
  if (cfg.demoEnabled) out.push({ id: "demo", label: "Query Engine (no AI)", configured: true, models: cfg.providers.demo.models, isDefault: true, source: "engine" });
  if (userId)
    for (const k of await listKeys(userId))
      out.push({ id: `${MINE}${k.id}`, label: k.name, configured: true, models: { balanced: k.model, budget: k.budgetModel || k.model }, isDefault: false, source: "mine" });
  // Server-wide keys are hidden unless an admin opts in: people add their own AI with "Add key…".
  const showTeam = process.env.GRID_SHOW_TEAM_KEYS === "true";
  for (const id of ["anthropic", "openai", "gemini"] as const) {
    if (!showTeam || !cfg.providers[id].apiKey) continue;
    out.push({ id, label: `Team key · ${{ anthropic: "Claude", openai: cfg.openaiLabel, gemini: "Gemini" }[id]}`, configured: true, models: cfg.providers[id].models, isDefault: false, source: "team" });
  }
  if (!cfg.demoEnabled && out[0]) out[0].isDefault = true;
  return out;
}

/** The requested provider, else the default (no AI). */
async function pickProvider(userId: string, requested?: string) {
  const list = await providerList(userId);
  const id = requested || list.find((x) => x.isDefault)?.id;
  const p = list.find((x) => x.id === id);
  if (!p) {
    if (requested?.startsWith(MINE) || ["anthropic", "openai", "gemini"].includes(requested ?? ""))
      throw new DriverError("provider_not_configured", "That AI is not set up. Use Add key… in Deal Desk's AI menu, or the Query Engine.", 400);
    if (requested) throw invalid(`Unknown AI provider "${requested}".`);
    throw new DriverError("provider_not_configured", "No AI provider is set up. Add your own key in Settings → AI setup.", 400);
  }
  return p;
}

export interface ChatInput {
  message: string;
  sessionId?: string;
  provider?: string;
  tier?: ModelTier;
  mode?: Mode;
}

export type ChatOutput = HarnessTurnResult & { spentTodayPhp: number; dailyCapPhp: number; mode?: Mode; sources?: SourceOut[]; actions?: AppAction[] };

export async function chat(userId: string, appId: string, input: ChatInput, bridge?: AppBridge): Promise<ChatOutput> {
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) throw invalid("Type a message first.");
  if (message.length > MAX_MESSAGE_CHARS) throw invalid(`Messages can be at most ${MAX_MESSAGE_CHARS} characters.`);
  const cfg = harnessConfig();
  const picked = await pickProvider(userId, input.provider);
  const providerId = picked.id;
  const tier: ModelTier = input.tier === "budget" ? "budget" : "balanced";

  // No-AI Query Engine: rule-based, free, no daily cap.
  if (providerId === "demo" && input.mode)
    throw new DriverError("ai_key_required", input.mode === "research" ? "Research needs an AI key: it reads the web and cites sources. Pick your AI in the menu, or use ＋ Add key…" : "Agent mode needs an AI key. Pick your AI in the menu, or use ＋ Add key…", 400);
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

  let provider;
  if (picked.source === "mine") {
    const k = await resolveKey(userId, providerId.slice(MINE.length));
    if (!k) throw new DriverError("provider_not_configured", "This AI key could not be read. Remove it and add it again with Add key…", 400);
    provider = createProvider(k.engine, k.settings, tier, undefined, { timeoutMs: cfg.limits.providerTimeoutMs, retries: 1 });
  } else {
    const id = providerId as Exclude<ProviderId, "demo">;
    provider = createProvider(id, cfg.providers[id], tier, undefined, { timeoutMs: cfg.limits.providerTimeoutMs, retries: 1 });
  }
  const sessionId = input.sessionId && UUID.test(input.sessionId) ? input.sessionId : crypto.randomUUID();
  const mode: Mode = input.mode ?? "agent";
  const today = manilaToday();
  const store = new CompactStore(new PgSessionStore(userId, appId, message.slice(0, 60)));
  const actions: AppAction[] = [];
  let ledger: SourceLedger | null = null;
  let harness: RealEstateHarness;
  if (mode === "research") {
    const saved = await kvGet(userId, `${appId}#research`, sessionId).catch(() => null);
    ledger = new SourceLedger(Array.isArray(saved) ? (saved as Source[]) : []);
    harness = new RealEstateHarness({
      tools: new ToolRegistry([...researchTools(ledger), ...DEFAULT_TOOLS]),
      sessions: store,
      system: researchPrompt({ brokerageName: cfg.brokerageName, today }),
      maxToolSteps: envNum("RESEARCH_MAX_TOOL_STEPS", 8),
      maxOutputTokens: envNum("RESEARCH_MAX_OUTPUT_TOKENS", 2500),
      maxCostPerTurnUsd: envNum("RESEARCH_MAX_COST_PER_TURN_USD", 0.75),
      deadlineMs: envNum("RESEARCH_DEADLINE_MS", 50_000),
      historyTurns: cfg.limits.historyTurns,
      usdToPhp: cfg.usdToPhp,
    });
  } else {
    const extra = bridge ? appTools(bridge, actions) : [];
    harness = new RealEstateHarness({
      tools: new ToolRegistry([...DEFAULT_TOOLS, ...extra]),
      sessions: store,
      system: agentPrompt({ brokerageName: cfg.brokerageName, today, appTools: extra.map((t) => t.definition.name) }),
      maxToolSteps: envNum("AGENT_MAX_TOOL_STEPS", Math.max(cfg.limits.maxToolSteps, 8)),
      maxOutputTokens: cfg.limits.maxOutputTokens,
      maxCostPerTurnUsd: envNum("AGENT_MAX_COST_PER_TURN_USD", cfg.limits.maxCostPerTurnUsd),
      deadlineMs: envNum("AGENT_DEADLINE_MS", 50_000),
      historyTurns: cfg.limits.historyTurns,
      usdToPhp: cfg.usdToPhp,
    });
  }
  const known = new Set(ledger?.all.map((x) => x.id) ?? []);
  const turn = await harness.chat(provider, message, sessionId);

  let sources: SourceOut[] | undefined;
  if (ledger) {
    const check = ledger.check(turn.reply);
    sources = [...check.cited.map((x) => ({ ...x, cited: true })), ...check.consulted.filter((x) => !known.has(x.id)).map((x) => ({ ...x, cited: false }))];
    if (check.unknownCitations.length) turn.warnings.push(`The answer cites ${check.unknownCitations.join(", ")}, which the research did not find. Treat those statements as unverified.`);
    if (check.unverifiedLinks.length) turn.warnings.push(`Links written by the AI that it did not open: ${check.unverifiedLinks.slice(0, 3).join(", ")}. Check them before sharing.`);
    if (!check.cited.length && turn.reply.length > 300) turn.warnings.push("This answer cites no sources. Ask for sources, or verify it before relying on it.");
    await kvSet(userId, `${appId}#research`, sessionId, ledger.all.slice(-40).map((x) => ({ ...x, snippet: x.snippet?.slice(0, 200) }))).catch(() => {});
  }
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
  return { ...turn, mode, sources, actions: actions.length ? actions : undefined, spentTodayPhp: Math.round((before + (turn.estimatedCostPhp ?? 0)) * 100) / 100, dailyCapPhp: cfg.limits.dailyCapPhp };
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
  await kvDel(userId, `${appId}#research`, sessionId).catch(() => {});
  if (UUID.test(sessionId)) await clearEngineState(userId, appId, sessionId);
  return true;
}
