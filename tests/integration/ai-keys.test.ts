import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BUILTIN_APPS, type AppInfo } from "@/lib/apps/catalog";
import { getDb } from "@/lib/db/client";
import { aiKeys } from "@/lib/db/schema";
import { callDriver, type Actor } from "@/lib/server/drivers";
import { createUser, type PublicUser } from "@/lib/server/services/auth";
import { freshDb } from "../helpers/db";
import { freshListingsDb } from "../helpers/listings-db";

let user: PublicUser;
const app = (id: string) => BUILTIN_APPS.find((a) => a.id === id)!;
const as = (a: AppInfo): Actor => ({ user, sessionId: "t", app: a });
const KEY = "sk-or-v1-0123456789abcdef-test-key-9z9z";

/** Stands in for OpenRouter: answers any chat completion with plain text. */
function fakeOpenRouter() {
  const calls: { url: string; auth: string; body: { model: string } }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, auth: String((init.headers as Record<string, string>).authorization ?? (init.headers as Record<string, string>).Authorization), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.00001 } }), { status: 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}

beforeAll(async () => {
  process.env.APP_SECRET ||= "test-secret-test-secret-test-secret-123";
  process.env.HARNESS_DEMO_PROVIDER = "true";
  process.env.ANTHROPIC_API_KEY = "";
  process.env.OPENAI_API_KEY = "";
  process.env.GEMINI_API_KEY = "";
  await freshDb();
  await freshListingsDb();
  user = await createUser({ username: "keyuser", password: "a long pass phrase 123", role: "broker" });
});
afterEach(() => vi.unstubAllGlobals());

describe("bring your own AI key", () => {
  it("defaults to no AI: the Query Engine is the default provider", async () => {
    const list = (await callDriver(as(app("deal-desk")), "ai.providers", {})) as { id: string; isDefault: boolean }[];
    expect(list.map((p) => p.id)).toEqual(["demo"]);
    expect(list[0]!.isDefault).toBe(true);
    const turn = (await callDriver(as(app("deal-desk")), "ai.chat", { message: "hello" })) as { model: string };
    expect(turn.model).toBe("grid-query-engine");
  });

  it("tests and saves a key encrypted; the key never comes back", async () => {
    const calls = fakeOpenRouter();
    const test = (await callDriver(as(app("settings")), "ai.keys.test", { provider: "openrouter", apiKey: KEY })) as { ok: boolean; model: string };
    expect(test).toMatchObject({ ok: true, model: "openai/gpt-4o" });
    expect(calls[0]!.url).toContain("openrouter.ai/api/v1/chat/completions");
    expect(calls[0]!.auth).toBe(`Bearer ${KEY}`);

    const saved = await callDriver(as(app("settings")), "ai.keys.save", { provider: "openrouter", apiKey: KEY, model: "anthropic/claude-haiku-5.5" });
    expect(JSON.stringify(saved)).not.toContain(KEY);
    expect(saved).toMatchObject({ keyHint: "9z9z", model: "anthropic/claude-haiku-5.5" });
    const [row] = await (await getDb()).select().from(aiKeys);
    expect(row!.keyEnc).not.toContain("sk-or");
    expect(JSON.stringify(await callDriver(as(app("settings")), "ai.keys.list", {}))).not.toContain(KEY);
  });

  it("only system apps manage keys", async () => {
    await expect(callDriver(as(app("deal-desk")), "ai.keys.list", {})).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("chats through the saved key when picked, and the Query Engine stays the default", async () => {
    const list = (await callDriver(as(app("deal-desk")), "ai.providers", {})) as { id: string; isDefault: boolean; label: string }[];
    expect(list.map((p) => p.id)).toEqual(["demo", "mine:openrouter"]);
    expect(list.find((p) => p.isDefault)!.id).toBe("demo");
    const calls = fakeOpenRouter();
    const turn = (await callDriver(as(app("deal-desk")), "ai.chat", { message: "What is a TCT?", provider: "mine:openrouter" })) as { reply: string; model: string };
    expect(turn.reply).toBe("OK");
    expect(calls[0]!.body.model).toBe("anthropic/claude-haiku-5.5");
    expect(calls[0]!.auth).toBe(`Bearer ${KEY}`);
    const st = (await callDriver(as(app("deal-desk")), "ai.status", {})) as { realAi: boolean };
    expect(st.realAi).toBe(true);
  });

  it("removes a key", async () => {
    await callDriver(as(app("settings")), "ai.keys.remove", { provider: "openrouter" });
    expect(await callDriver(as(app("settings")), "ai.keys.list", {})).toEqual([]);
    await expect(callDriver(as(app("deal-desk")), "ai.chat", { message: "hi", provider: "mine:openrouter" })).rejects.toMatchObject({ code: "provider_not_configured" });
  });
});
