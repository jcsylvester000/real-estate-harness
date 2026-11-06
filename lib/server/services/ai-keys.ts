/**
 * Bring your own AI. Grid Agentic runs with no AI by default (the Query Engine). A person adds an AI from
 * Deal Desk's "Add key…" (or Settings → AI setup): pick a provider and model, or name a custom one, paste the
 * key, and it is tested step by step before it joins their AI menu. Several keys per person, each with a name.
 * Keys are encrypted at rest and never returned to the browser.
 */
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/lib/auth/crypto";
import { getDb } from "@/lib/db/client";
import { aiKeys } from "@/lib/db/schema";
import { createProvider, type ModelProvider, type ProviderId } from "@/lib/harness";
import type { ProviderSettings } from "@/lib/harness/config";
import { invalid, notFound } from "../errors";
import { audit } from "./audit";

export const KEY_PROVIDERS = {
  openrouter: { label: "OpenRouter (many models, one key)", short: "OpenRouter", engine: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o", budget: "openai/gpt-4o-mini", keyHelp: "openrouter.ai → Keys", keyPattern: /^sk-or-/, models: ["openai/gpt-4o", "openai/gpt-4o-mini", "anthropic/claude-sonnet-4.5", "anthropic/claude-haiku-4.5", "google/gemini-2.5-flash", "meta-llama/llama-3.3-70b-instruct", "deepseek/deepseek-chat"] },
  anthropic: { label: "Claude (Anthropic)", short: "Claude", engine: "anthropic", baseUrl: "", model: "claude-sonnet-5-5", budget: "claude-haiku-5-5", keyHelp: "console.anthropic.com → API keys", keyPattern: /^sk-ant-/, models: ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"] },
  openai: { label: "OpenAI (ChatGPT)", short: "OpenAI", engine: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-6.1-sol", budget: "gpt-6-luna", keyHelp: "platform.openai.com → API keys", keyPattern: /^sk-/, models: ["gpt-6.1-sol", "gpt-6-luna", "gpt-4o", "gpt-4o-mini"] },
  gemini: { label: "Google Gemini", short: "Gemini", engine: "gemini", baseUrl: "", model: "gemini-3.1-pro", budget: "gemini-3.5-flash-lite", keyHelp: "aistudio.google.com → Get API key", keyPattern: /^AI/, models: ["gemini-3.1-pro", "gemini-3.5-flash", "gemini-3.5-flash-lite"] },
  custom: { label: "Other OpenAI-compatible (Groq, DeepSeek, Together, Ollama…)", short: "Custom", engine: "openai", baseUrl: "", model: "", budget: "", keyHelp: "your provider's dashboard", keyPattern: /./, models: [] as string[] },
} as const satisfies Record<string, { label: string; short: string; engine: Exclude<ProviderId, "demo">; baseUrl: string; model: string; budget: string; keyHelp: string; keyPattern: RegExp; models: readonly string[] }>;
export type KeyProvider = keyof typeof KEY_PROVIDERS;
export const KEY_PROVIDER_IDS = Object.keys(KEY_PROVIDERS) as KeyProvider[];

/** Presets for the Add key dialog (no secrets). */
export const keyPresets = () => KEY_PROVIDER_IDS.map((id) => ({ id, label: KEY_PROVIDERS[id].label, short: KEY_PROVIDERS[id].short, model: KEY_PROVIDERS[id].model, budget: KEY_PROVIDERS[id].budget, baseUrl: KEY_PROVIDERS[id].baseUrl, keyHelp: KEY_PROVIDERS[id].keyHelp, models: [...KEY_PROVIDERS[id].models] }));

/** Chat provider ids for a person's own key: "mine:<key id>". */
export const MINE = "mine:";

export const keyInput = z.object({
  /** Existing key to change; omit to add a new one. */
  id: z.string().uuid().optional(),
  name: z.string().trim().max(60).default(""),
  provider: z.enum(KEY_PROVIDER_IDS as [KeyProvider, ...KeyProvider[]]),
  /** Omit when editing to keep the saved key. */
  apiKey: z.string().trim().min(8).max(400).optional(),
  model: z.string().trim().max(120).default(""),
  budgetModel: z.string().trim().max(120).default(""),
  baseUrl: z.string().trim().max(300).default(""),
});
export type KeyInput = z.infer<typeof keyInput>;

export interface SavedKey {
  id: string;
  name: string;
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

const defaultName = (p: KeyProvider, model: string) => `${KEY_PROVIDERS[p].short} · ${model.split("/").pop()}`.slice(0, 60);

export async function listKeys(userId: string): Promise<SavedKey[]> {
  const db = await getDb();
  const rows = await db.select().from(aiKeys).where(eq(aiKeys.userId, userId)).orderBy(asc(aiKeys.updatedAt));
  return rows
    .filter((r) => r.provider in KEY_PROVIDERS)
    .map((r) => {
      const p = r.provider as KeyProvider;
      return { id: r.id, name: r.name || defaultName(p, r.model), provider: p, label: KEY_PROVIDERS[p].label, keyHint: r.keyHint, model: r.model, budgetModel: r.budgetModel, baseUrl: r.baseUrl, updatedAt: r.updatedAt.toISOString() };
    });
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

function validate(input: KeyInput) {
  checkUrl(input.baseUrl);
  if (input.provider === "custom" && !input.baseUrl) throw invalid("Enter the provider's base URL (it usually ends in /v1).");
  if (input.provider === "custom" && !input.model) throw invalid("Enter the model name your provider uses.");
}

export async function saveKey(userId: string, input: KeyInput): Promise<SavedKey> {
  validate(input);
  const preset = KEY_PROVIDERS[input.provider];
  const model = input.model || preset.model;
  const name = (input.name || defaultName(input.provider, model)).slice(0, 60);
  const db = await getDb("write");
  const mine = await listKeys(userId);
  if (mine.some((k) => k.name.toLowerCase() === name.toLowerCase() && k.id !== input.id)) throw invalid(`You already have an AI called “${name}”. Pick another name.`);
  const values = {
    name,
    provider: input.provider,
    model,
    budgetModel: input.budgetModel || preset.budget,
    baseUrl: input.baseUrl,
    updatedAt: new Date(),
    ...(input.apiKey ? { keyEnc: encryptSecret(input.apiKey), keyHint: input.apiKey.slice(-4) } : {}),
  };
  let id = input.id;
  if (id) {
    const r = await db.update(aiKeys).set(values).where(and(eq(aiKeys.id, id), eq(aiKeys.userId, userId))).returning({ id: aiKeys.id });
    if (!r.length) throw notFound("Saved key");
  } else {
    if (!input.apiKey) throw invalid("Paste the API key.");
    if (mine.length >= 12) throw invalid("You can keep up to 12 AI keys. Remove one first.");
    const [r] = await db.insert(aiKeys).values({ userId, ...values, keyEnc: values.keyEnc!, keyHint: values.keyHint! }).returning({ id: aiKeys.id });
    id = r!.id;
  }
  await audit(userId, "ai_key.saved", { provider: input.provider, name });
  return (await listKeys(userId)).find((k) => k.id === id)!;
}

export async function removeKey(userId: string, id: string) {
  const db = await getDb("write");
  const r = await db.delete(aiKeys).where(and(eq(aiKeys.id, id), eq(aiKeys.userId, userId))).returning({ p: aiKeys.provider });
  if (!r.length) throw notFound("Saved key");
  await audit(userId, "ai_key.removed", { provider: r[0]!.p });
  return true;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Engine and settings for one saved key (server only). */
export async function resolveKey(userId: string, id: string): Promise<{ engine: Exclude<ProviderId, "demo">; settings: ProviderSettings; label: string; name: string } | null> {
  if (!UUID.test(id)) return null;
  const db = await getDb();
  const [r] = await db.select().from(aiKeys).where(and(eq(aiKeys.id, id), eq(aiKeys.userId, userId)));
  if (!r || !(r.provider in KEY_PROVIDERS)) return null;
  const apiKey = decryptSecret(r.keyEnc);
  if (!apiKey) return null; // APP_SECRET changed: the key must be entered again
  const p = r.provider as KeyProvider;
  return { engine: KEY_PROVIDERS[p].engine, settings: settingsFor(p, apiKey, r.model, r.budgetModel, r.baseUrl), label: KEY_PROVIDERS[p].label, name: r.name || defaultName(p, r.model) };
}

/** First saved key, for features that just need "an AI" (Property Teaser's Polish with AI). */
export async function anyKeyProvider(userId: string, preferred?: string): Promise<{ provider: ModelProvider; label: string } | null> {
  const keys = await listKeys(userId);
  const order = preferred ? [preferred, ...keys.map((k) => k.id)] : keys.map((k) => k.id);
  for (const id of order) {
    const r = await resolveKey(userId, id);
    if (r) return { provider: createProvider(r.engine, r.settings, "budget", undefined, { timeoutMs: 25_000, retries: 0 }), label: r.name };
  }
  return null;
}

// ---------------------------------------------------------------- staged connection test

export interface TestStep {
  id: "format" | "connect" | "model" | "tools";
  label: string;
  status: "ok" | "warn" | "fail" | "skip";
  detail: string;
  ms?: number;
}

/** Plain-language reason for a provider error. */
function explain(e: unknown, apiKey: string): { step: "connect" | "model"; detail: string } {
  const raw = (e instanceof Error ? e.message : String(e)).split(apiKey).join("••••");
  const status = (e as { status?: number }).status ?? Number(raw.match(/HTTP (\d{3})/)?.[1] ?? 0);
  if (status === 401 || status === 403) return { step: "connect", detail: "The provider rejected this key. Check that you copied all of it and that it is active." };
  if (status === 402) return { step: "connect", detail: "The key works but the account has no credit. Add credit with the provider." };
  if (status === 404) return { step: "model", detail: "The provider does not know this model name (or the base URL is wrong)." };
  if (status === 429) return { step: "connect", detail: "The provider is rate-limiting this key right now. Wait a minute and test again." };
  if (status >= 500) return { step: "connect", detail: `The provider had a problem (HTTP ${status}). Try again shortly.` };
  if (/abort|timeout|timed out/i.test(raw)) return { step: "connect", detail: "No answer within 20 seconds. Check the base URL and your internet connection." };
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(raw)) return { step: "connect", detail: "Could not reach the provider. Check the base URL." };
  return { step: "model", detail: raw.slice(0, 240) };
}

/**
 * Tests a key in steps: key format → reach the provider and sign in → the model answers → tool use
 * (GRID's calculators and listings need it). Uses the form's values, or the saved key when editing.
 */
export async function testKey(userId: string, input: KeyInput) {
  validate(input);
  let apiKey = input.apiKey;
  if (!apiKey && input.id) apiKey = (await resolveKey(userId, input.id))?.settings.apiKey;
  if (!apiKey) throw invalid("Paste the API key to test it.");
  const preset = KEY_PROVIDERS[input.provider];
  const settings = settingsFor(input.provider, apiKey, input.model, input.budgetModel, input.baseUrl);
  const steps: TestStep[] = [];
  const started = Date.now();

  const fmtOk = preset.keyPattern.test(apiKey) && !/\s/.test(apiKey);
  steps.push({ id: "format", label: "Key format", status: fmtOk ? "ok" : "warn", detail: fmtOk ? "Looks like a " + preset.short + " key." : `${preset.short} keys usually start differently; testing anyway.` });

  const provider = createProvider(preset.engine, settings, "balanced", undefined, { timeoutMs: 20_000, retries: 0 });
  let t = Date.now();
  try {
    const r = await provider.complete({ system: "Reply with the single word OK.", messages: [{ role: "user", content: "Say OK." }], tools: [], maxOutputTokens: 16 });
    steps.push({ id: "connect", label: "Reach the provider and sign in", status: "ok", detail: "Signed in.", ms: Date.now() - t });
    steps.push({ id: "model", label: `Model answers (${provider.model})`, status: r.text.trim() ? "ok" : "warn", detail: r.text.trim() ? `Replied “${r.text.trim().slice(0, 30)}”.` : "Replied with no text.", ms: Date.now() - t });
  } catch (e) {
    const x = explain(e, apiKey);
    if (x.step === "connect") steps.push({ id: "connect", label: "Reach the provider and sign in", status: "fail", detail: x.detail, ms: Date.now() - t });
    else {
      steps.push({ id: "connect", label: "Reach the provider and sign in", status: "ok", detail: "Signed in.", ms: Date.now() - t });
      steps.push({ id: "model", label: `Model answers (${provider.model})`, status: "fail", detail: x.detail, ms: Date.now() - t });
    }
    if (!steps.some((s) => s.id === "model")) steps.push({ id: "model", label: `Model answers (${provider.model})`, status: "skip", detail: "" });
    steps.push({ id: "tools", label: "Uses GRID's tools", status: "skip", detail: "" });
    return { ok: false, model: provider.model, ms: Date.now() - started, steps };
  }

  t = Date.now();
  try {
    const r = await provider.complete({
      system: "You can call tools. When asked for a monthly payment, call the tool.",
      messages: [{ role: "user", content: "What is the monthly payment on a 1,000,000 peso loan at 6% for 10 years? Use the tool." }],
      tools: [{ name: "compute_payment", description: "Monthly loan payment.", parameters: { type: "object", properties: { loan: { type: "number" }, ratePercent: { type: "number" }, years: { type: "number" } }, required: ["loan", "ratePercent", "years"] } }],
      maxOutputTokens: 120,
    });
    const used = r.toolCalls.some((c) => c.name === "compute_payment");
    steps.push({ id: "tools", label: "Uses GRID's tools", status: used ? "ok" : "warn", detail: used ? "Called a calculator correctly." : "Answered without calling the calculator. It can chat, but may skip GRID's calculators and listings.", ms: Date.now() - t });
  } catch (e) {
    steps.push({ id: "tools", label: "Uses GRID's tools", status: "warn", detail: `This model may not support tools: ${explain(e, apiKey).detail}`, ms: Date.now() - t });
  }
  return { ok: true, model: provider.model, ms: Date.now() - started, steps };
}
