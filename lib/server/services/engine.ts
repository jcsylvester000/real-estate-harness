/**
 * Wires the Query Engine (lib/engine) to GRID's services for one user, and keeps its dialogue state.
 * Used by ai.chat when the "Query Engine (no AI)" provider is chosen. No model, no cost.
 */
import { and, eq } from "drizzle-orm";
import { ToolRegistry, type ChatMessage, type HarnessTurnResult } from "@/lib/harness";
import { getDb } from "@/lib/db/client";
import { kv } from "@/lib/db/schema";
import { runEngine, type EngineState, type EngineTools } from "@/lib/engine/engine";
import { buyersForListing, listBuyers, matchNow } from "@/lib/listings/buyers";
import { facets, getListing, searchListings } from "@/lib/listings/search";
import * as docs from "./documents";
import * as lenders from "./lenders";
import "./listings";

const registry = new ToolRegistry();
export const ENGINE_MODEL = "grid-query-engine";
const stateKey = (sessionId: string) => `engine:${sessionId}`;
const STATE_APP = (appId: string) => `${appId}#engine`;

export function engineTools(userId: string): EngineTools {
  return {
    search: (input) => searchListings(input),
    getListing: async (code) => {
      const l = await getListing(code);
      return l ? { ...l, listedBy: "", listedByEmail: "" } : null; // contacts never go into chat history
    },
    facets: () => facets(),
    match: (criteria, page) => matchNow(criteria, page),
    buyersForListing: (code) => buyersForListing(code),
    compareLenders: (input) => lenders.compare(input as unknown as Parameters<typeof lenders.compare>[0]),
    runTool: (name, args) => registry.execute(name, args),
    listDocuments: () => docs.listDocuments(userId),
    getDocumentText: async (id) => (await docs.getDocument(userId, id, true)).text ?? "",
    searchDocuments: (q, ids) => docs.searchDocuments(userId, q, { documentIds: ids }),
    notes: () => docs.recentNotes(userId, 30),
    buyers: async () => (await listBuyers()).map((b) => ({ id: b.id, label: b.label, criteria: b.criteria })),
  };
}

async function loadState(userId: string, appId: string, sessionId: string): Promise<EngineState | null> {
  const db = await getDb();
  const [r] = await db.select({ value: kv.value }).from(kv).where(and(eq(kv.userId, userId), eq(kv.appId, STATE_APP(appId)), eq(kv.key, stateKey(sessionId))));
  return (r?.value as EngineState) ?? null;
}

async function saveState(userId: string, appId: string, sessionId: string, state: EngineState) {
  const db = await getDb("write");
  const value = state as unknown as Record<string, unknown>;
  await db
    .insert(kv)
    .values({ userId, appId: STATE_APP(appId), key: stateKey(sessionId), value })
    .onConflictDoUpdate({ target: [kv.userId, kv.appId, kv.key], set: { value, updatedAt: new Date() } });
}

export async function clearEngineState(userId: string, appId: string, sessionId: string) {
  const db = await getDb("write");
  await db.delete(kv).where(and(eq(kv.userId, userId), eq(kv.appId, STATE_APP(appId)), eq(kv.key, stateKey(sessionId))));
}

export async function engineTurn(
  userId: string,
  appId: string,
  message: string,
  sessionId: string,
  store: { get(id: string): Promise<ChatMessage[]>; save(id: string, m: ChatMessage[]): Promise<void> },
): Promise<HarnessTurnResult & { intent: string | null; suggestions: string[] }> {
  const [history, prev] = await Promise.all([store.get(sessionId), loadState(userId, appId, sessionId)]);
  const r = await runEngine(message, prev, engineTools(userId));
  await Promise.all([store.save(sessionId, [...history, { role: "user", content: message }, { role: "assistant", content: r.reply }]), saveState(userId, appId, sessionId, r.state)]);
  return {
    sessionId,
    reply: r.reply,
    provider: "demo",
    model: ENGINE_MODEL,
    toolTrace: r.trace.map((t) => ({ ...t, result: trimResult(t.result) })),
    usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
    estimatedCostUsd: 0,
    estimatedCostPhp: 0,
    steps: r.trace.length,
    warnings: [],
    intent: r.intent,
    suggestions: r.suggestions,
  };
}

/** Keeps the "calculations used" panel small: listing cards and long text are cut down. */
function trimResult(x: unknown): unknown {
  const s = JSON.stringify(x ?? null);
  if (s.length < 6000) return x;
  return { note: "Large result shortened for display.", preview: s.slice(0, 2000) + "…" };
}
