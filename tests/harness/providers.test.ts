// Adapter tests with a fake fetch: checks each provider's request shape and response parsing,
// so the harness behaves the same on Claude, OpenAI-compatible APIs and Gemini.
import assert from "node:assert/strict";
import { test } from "vitest";
import type { ModelRequest } from "@/lib/harness/harness/types";
import { AnthropicProvider } from "@/lib/harness/providers/anthropic";
import { GeminiProvider } from "@/lib/harness/providers/gemini";
import { OpenAICompatibleProvider } from "@/lib/harness/providers/openai-compatible";

function fakeFetch(responseBody: unknown, seen: { url?: string; body?: any; headers?: any }) {
  return (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.body = JSON.parse(String(init.body));
    seen.headers = init.headers;
    return new Response(JSON.stringify(responseBody), { status: 200 });
  }) as unknown as typeof fetch;
}

const request: ModelRequest = {
  system: "SYSTEM",
  maxOutputTokens: 500,
  tools: [{ name: "compute_commission", description: "d", parameters: { type: "object", properties: { salePrice: { type: "number" } }, required: ["salePrice"] } }],
  messages: [
    { role: "user", content: "Commission on 1M?" },
    { role: "assistant", content: "", toolCalls: [{ id: "call_1", name: "compute_commission", arguments: { salePrice: 1_000_000 }, meta: { thoughtSignature: "SIG" } }] },
    { role: "tool", toolCallId: "call_1", name: "compute_commission", content: '{"grossCommission":50000}' },
  ],
};

test("Anthropic: caching markers, tool_result turn, usage mapping", async () => {
  const seen: any = {};
  const p = new AnthropicProvider({
    apiKey: "k", model: "claude-haiku-5-5",
    http: { fetchImpl: fakeFetch({ content: [{ type: "text", text: "₱50,000" }, { type: "tool_use", id: "t2", name: "x", input: { a: 1 } }], usage: { input_tokens: 100, cache_read_input_tokens: 900, output_tokens: 20 }, stop_reason: "tool_use" }, seen) },
  });
  const r = await p.complete(request);
  assert.equal(seen.url, "https://api.anthropic.com/v1/messages");
  assert.equal(seen.body.system[0].cache_control.type, "ephemeral");
  assert.equal(seen.body.tools[0].input_schema.type, "object");
  assert.equal(seen.body.messages[2]!.content[0]!.type, "tool_result");
  assert.equal(r.text, "₱50,000");
  assert.deepEqual(r.toolCalls[0], { id: "t2", name: "x", arguments: { a: 1 } });
  assert.deepEqual(r.usage, { inputTokens: 100, cachedInputTokens: 900, outputTokens: 20 });
});

test("OpenAI-compatible: function tools, stringified args, cached tokens", async () => {
  const seen: any = {};
  const p = new OpenAICompatibleProvider({
    apiKey: "k", model: "gpt-6-luna",
    http: { fetchImpl: fakeFetch({ choices: [{ message: { content: null, tool_calls: [{ id: "c9", type: "function", function: { name: "compute_commission", arguments: '{"salePrice":2000000}' } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 1000, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 800 } } }, seen) },
  });
  const r = await p.complete(request);
  assert.equal(seen.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(seen.body.max_completion_tokens, 500);
  assert.equal(seen.body.messages[0]!.role, "system");
  assert.equal(seen.body.messages[2]!.tool_calls[0]!.function.arguments, '{"salePrice":1000000}');
  assert.equal(seen.body.messages[3]!.role, "tool");
  assert.deepEqual(r.toolCalls[0]!.arguments, { salePrice: 2_000_000 });
  assert.deepEqual(r.usage, { inputTokens: 200, cachedInputTokens: 800, outputTokens: 30 });
});

test("OpenAI-compatible: other base URLs get max_tokens", async () => {
  const seen: any = {};
  const p = new OpenAICompatibleProvider({ apiKey: "k", model: "llama", baseUrl: "http://localhost:11434/v1/", http: { fetchImpl: fakeFetch({ choices: [{ message: { content: "hi" } }] }, seen) } });
  await p.complete(request);
  assert.equal(seen.url, "http://localhost:11434/v1/chat/completions");
  assert.equal(seen.body.max_tokens, 500);
});

test("Gemini: function declarations, thought signature round-trip, thinking billed as output", async () => {
  const seen: any = {};
  const p = new GeminiProvider({
    apiKey: "k", model: "gemini-3.5-flash-lite",
    http: { fetchImpl: fakeFetch({ candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { functionCall: { name: "search_listings", args: { city: "Pasig" } }, thoughtSignature: "SIG2" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 600, candidatesTokenCount: 40, thoughtsTokenCount: 60 } }, seen) },
  });
  const r = await p.complete(request);
  assert.match(seen.url, /models\/gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(seen.headers["x-goog-api-key"], "k");
  assert.equal(seen.body.tools[0].functionDeclarations[0].name, "compute_commission");
  assert.equal(seen.body.contents[1]!.role, "model");
  assert.equal(seen.body.contents[1]!.parts[0]!.thoughtSignature, "SIG");
  assert.equal(seen.body.contents[2]!.parts[0]!.functionResponse.response.result.grossCommission, 50000);
  assert.equal(r.text, "");
  assert.equal(r.toolCalls[0]!.meta?.thoughtSignature, "SIG2");
  assert.deepEqual(r.usage, { inputTokens: 400, cachedInputTokens: 600, outputTokens: 100 });
});

test("provider errors surface status without retrying 4xx", async () => {
  let calls = 0;
  const fetchImpl = (async () => { calls++; return new Response('{"error":"bad key"}', { status: 401 }); }) as unknown as typeof fetch;
  const p = new AnthropicProvider({ apiKey: "bad", model: "claude-haiku-5-5", http: { fetchImpl } });
  await assert.rejects(p.complete(request), /HTTP 401/);
  assert.equal(calls, 1);
});
