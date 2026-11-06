/**
 * Bring your own AI key. Grid Agentic runs with no AI by default (the Query Engine); a person can add a key
 * from an AI provider in Settings → AI setup, and Deal Desk, the harness tools and Property Teaser's
 * "Polish with AI" then use it. Keys are encrypted at rest and never returned to the browser.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/lib/auth/crypto";
import { getDb } from "@/lib/db/client";
import { aiKeys } from "@/lib/db/schema";
import { createProvider, type ModelProvider, type ProviderId } from "@/lib/harness";
import type { ProviderSettings } from "@/lib/harness/config";
import { invalid, notFound } from "../errors";
import { audit } from "./audit";

export const KEY_PROVIDERS = {
  anthropic: { label: "Claude (Anthropic)", engine: "anthropic", baseUrl: "", model: "claude-sonnet-5-5", budget: "claude-haiku-5-5", keyHelp: "console.anthropic.com → API keys", keyPattern: /^sk-ant-/ },
  openai: { label: "OpenAI (ChatGPT)", engine: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-6.1-sol", budget: "gpt-6-luna", keyHelp: "platform.openai.com → API keys", keyPattern: /^sk-/ },
  openrouter: { label: "OpenRouter (many models, one key)", engine: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o", budget: "openai/gpt-4o-mini", keyHelp: "openrouter.ai → Keys", keyPattern: /^sk-or-/ },
  gemini: { label: "Google Gemini", engine: "gemini", baseUrl: "", model: "gemini-3.1-pro", budget: "gemini-3.5-flash-lite", keyHelp: "aistudio.google.com → Get API key", keyPattern: /^AI/ },
  custom: { label: "Other OpenAI-compatible (Groq, DeepSeek, Ollama…)", engine: "openai", baseUrl: "", model: "", budget: "", keyHelp: "your provider's dashboard", keyPattern: /./ },
} as const satisfies Record<string, { label: string; engine: Exclude<ProviderId, "demo">; baseUrl: string; model: string; budget: string; keyHelp: string; keyPattern: RegExp }>;
export type KeyProvider = keyof typeof KEY_PROVIDERS;
export const KEY_PROVIDER_IDS = Object.keys(KEY_PROVIDERS) as KeyProvider[];

/** Chat provider ids for a person's own key: "mine:openrouter". */
export const MINE = "mine:";

export const keyInput = z.object({
  provider: z.enum(KEY_PROVIDER_IDS as [KeyProvider, ...KeyProvider[]]),
  /** Omit to keep the saved key and change only the model or URL. */
  apiKey: z.string().trim().min(8).max(400).optional(),
  model: z.string().trim().max(120).default(""),
  budgetModel: z.string().trim().max(120).default(""),
  baseUrl: z.string().trim().max(300).default(""),
});
export type KeyInput = z.infer<typeof keyInput>;

export interface SavedKey {
  provider: KeyProvider;
  label: string;
  keyHint: string;
  model: string;
  budgetModel: string;
  baseUrl: string;
  updatedAt: string;
}

function checkUrl(url: string) {
  if (!url) return;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw invalid("The base URL is not a valid address.");
  }
  if (u.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) throw invalid("Use an https:// base URL (http is allowed only for localhost).");
}

export async function listKeys(userId: string): Promise<SavedKey[]> {
  const db = await getDb();
  const rows = await db.select().from(aiKeys).where(eq(aiKeys.userId, userId));
  return rows
    .filter((r) => r.provider in KEY_PROVIDERS)
    .map((r) => ({ provider: r.provider as KeyProvider, label: KEY_PROVIDERS[r.provider as KeyProvider].label, keyHint: r.keyHint, model: r.model, budgetModel: r.budgetModel, baseUrl: r.baseUrl, updatedAt: r.updatedAt.toISOString() }));
}

function settingsFor(p: KeyProvider, apiKey: string, model: string, budgetModel: string, baseUrl: string): ProviderSettings {
  const preset = KEY_PROVIDERS[p];
  const m = model || preset.model;
  return {
    apiKey,
    models: { balanced: m, budget: budgetModel || preset.budget || m },
    baseUrl: baseUrl || preset.baseUrl || undefined,
    extraHeaders: p === "openrouter" ? { "HTTP-Referer": process.env.APP_ORIGIN || "http://localhost:3000", "X-Title": "Grid Agentic" } : undefined,
  };
}

export async function saveKey(userId: string, input: KeyInput): Promise<SavedKey> {
  const preset = KEY_PROVIDERS[input.provider];
  checkUrl(input.baseUrl);
  if (input.provider === "custom" && !input.baseUrl) throw invalid("Enter the provider's base URL (it usually ends in /v1).");
  if (input.provider === "custom" && !input.model) throw invalid("Enter the model name your provider uses.");
  const db = await getDb("write");
  const [existing] = await db.select().from(aiKeys).where(and(eq(aiKeys.userId, userId), eq(aiKeys.provider, input.provider)));
  if (!existing && !input.apiKey) throw invalid("Paste the API key.");
  const values = {
    model: input.model || preset.model,
    budgetModel: input.budgetModel || preset.budget,
    baseUrl: input.baseUrl,
    updatedAt: new Date(),
    ...(input.apiKey ? { keyEnc: encryptSecret(input.apiKey), keyHint: input.apiKey.slice(-4) } : {}),
  };
  if (existing) await db.update(aiKeys).set(values).where(and(eq(aiKeys.userId, userId), eq(aiKeys.provider, input.provider)));
  else await db.insert(aiKeys).values({ userId, provider: input.provider, keyEnc: values.keyEnc!, keyHint: values.keyHint!, model: values.model, budgetModel: values.budgetModel, baseUrl: values.baseUrl });
  await audit(userId, "ai_key.saved", { provider: input.provider });
  return (await listKeys(userId)).find((k) => k.provider === input.provider)!;
}

export async function removeKey(userId: string, provider: string) {
  const db = await getDb("write");
  const r = await db.delete(aiKeys).where(and(eq(aiKeys.userId, userId), eq(aiKeys.provider, provider))).returning({ p: aiKeys.provider });
  if (!r.length) throw notFound("Saved key");
  await audit(userId, "ai_key.removed", { provider });
  return true;
}

/** Engine and settings for one of the person's saved keys (server only). */
export async function resolveKey(userId: string, provider: string): Promise<{ engine: Exclude<ProviderId, "demo">; settings: ProviderSettings; label: string } | null> {
  if (!(provider in KEY_PROVIDERS)) return null;
  const db = await getDb();
  const [r] = await db.select().from(aiKeys).where(and(eq(aiKeys.userId, userId), eq(aiKeys.provider, provider)));
  if (!r) return null;
  const apiKey = decryptSecret(r.keyEnc);
  if (!apiKey) return null; // APP_SECRET changed: the key must be entered again
  const p = provider as KeyProvider;
  return { engine: KEY_PROVIDERS[p].engine, settings: settingsFor(p, apiKey, r.model, r.budgetModel, r.baseUrl), label: KEY_PROVIDERS[p].label };
}

/** First saved key, for features that just need "an AI" (Property Teaser's Polish with AI). */
export async function anyKeyProvider(userId: string, preferred?: string): Promise<{ provider: ModelProvider; label: string } | null> {
  const keys = await listKeys(userId);
  const order = preferred ? [preferred, ...keys.map((k) => k.provider)] : keys.map((k) => k.provider);
  for (const p of order) {
    const r = await resolveKey(userId, p);
    if (r) return { provider: createProvider(r.engine, r.settings, "budget", undefined, { timeoutMs: 25_000, retries: 0 }), label: r.label };
  }
  return null;
}

/** Sends one tiny message to check the key and model work. Uses the form's values, or the saved key. */
export async function testKey(userId: string, input: KeyInput) {
  let apiKey = input.apiKey;
  if (!apiKey) {
    const saved = await resolveKey(userId, input.provider);
    if (!saved) throw invalid("Paste the API key to test it.");
    apiKey = saved.settings.apiKey;
  }
  checkUrl(input.baseUrl);
  const preset = KEY_PROVIDERS[input.provider];
  const settings = settingsFor(input.provider, apiKey, input.model, input.budgetModel, input.baseUrl);
  const started = Date.now();
  try {
    const provider = createProvider(preset.engine, settings, "balanced", undefined, { timeoutMs: 20_000, retries: 0 });
    const r = await provider.complete({ system: "Reply with the single word OK.", messages: [{ role: "user", content: "Say OK." }], tools: [], maxOutputTokens: 16 });
    return { ok: true, model: provider.model, ms: Date.now() - started, reply: r.text.slice(0, 40) };
  } catch (e) {
    // Never echo the key; provider errors can include request details.
    const msg = (e instanceof Error ? e.message : String(e)).replace(apiKey, "••••").slice(0, 300);
    return { ok: false, model: settings.models.balanced, ms: Date.now() - started, error: msg };
  }
}
