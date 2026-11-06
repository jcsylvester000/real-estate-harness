// Agent-loop tests with a scripted provider (no network): tool execution, session memory,
// cost tracking, step cap and guardrails.
import assert from "node:assert/strict";
import { test } from "vitest";
import { RealEstateHarness } from "@/lib/harness/harness/harness";
import type { ModelProvider, ModelRequest, ModelResponse } from "@/lib/harness/harness/types";

class ScriptedProvider implements ModelProvider {
  readonly id = "anthropic" as const;
  readonly requests: ModelRequest[] = [];
  constructor(readonly model: string, private readonly script: ModelResponse[]) {}
  async complete(req: ModelRequest): Promise<ModelResponse> {
    this.requests.push(structuredClone(req));
    return this.script.shift() ?? { text: "done", toolCalls: [], usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }, stopReason: "end" };
  }
}
const usage = { inputTokens: 1000, cachedInputTokens: 2000, outputTokens: 200 };

test("runs a tool, feeds the result back, and returns the final answer with cost", async () => {
  const provider = new ScriptedProvider("claude-sonnet-5-5", [
    { text: "", toolCalls: [{ id: "a1", name: "compute_acquisition_costs", arguments: { sellingPrice: 7_600_000, lguType: "city_or_metro_manila" } }], usage, stopReason: "tool_use" },
    { text: "Buyer pays about ₱190,000 in closing costs.", toolCalls: [], usage, stopReason: "end_turn" },
  ]);
  const h = new RealEstateHarness();
  const r = await h.chat(provider, "Closing costs for ₱7.6M Pasig condo?", "s1");
  assert.equal(r.steps, 2);
  assert.equal(r.toolTrace[0]!.name, "compute_acquisition_costs");
  assert.equal((r.toolTrace[0]!.result as any).totals.buyer, 190_000);
  assert.equal(provider.requests[1]!.messages.at(-1)?.role, "tool");
  assert.deepEqual(r.usage, { inputTokens: 2000, cachedInputTokens: 4000, outputTokens: 400 });
  // Sonnet 5.5: (2000×2 + 4000×0.1 + 400×10) / 1e6 = $0.0084
  assert.equal(r.estimatedCostUsd, 0.0084);
  assert.equal(r.warnings.length, 0);
  assert.ok(provider.requests[0]!.system.includes("RA 9646"));
  assert.equal(provider.requests[0]!.tools.length, 10);
});

test("keeps session history between turns", async () => {
  const provider = new ScriptedProvider("claude-haiku-5-5", [
    { text: "Hello!", toolCalls: [], usage, stopReason: "end" },
    { text: "Yes, Pasig.", toolCalls: [], usage, stopReason: "end" },
  ]);
  const h = new RealEstateHarness();
  await h.chat(provider, "Client prefers Pasig.", "s2");
  await h.chat(provider, "Which city again?", "s2");
  assert.equal(provider.requests[1]!.messages.length, 3);
  assert.equal(provider.requests[1]!.messages[0]!.role, "user");
});

test("stops at the tool step cap", async () => {
  const loop = { text: "", toolCalls: [{ id: "x", name: "get_rule_topic", arguments: { topic: "licensing" } }], usage, stopReason: "tool_use" };
  const provider = new ScriptedProvider("claude-haiku-5-5", [loop, loop, loop, loop]);
  const h = new RealEstateHarness({ maxToolSteps: 3 });
  const r = await h.chat(provider, "loop", "s3");
  assert.equal(r.steps, 3);
  assert.ok(r.warnings.some(w => w.includes("maximum tool steps")));
});

test("guardrails flag uncomputed peso figures and sensitive numbers", async () => {
  const provider = new ScriptedProvider("unknown-model", [{ text: "The transfer tax is ₱57,000.", toolCalls: [], usage, stopReason: "end" }]);
  const h = new RealEstateHarness();
  const r = await h.chat(provider, "My TIN is 123-456-789-000, what is the transfer tax?", "s4");
  assert.ok(r.warnings.some(w => w.includes("TIN")));
  assert.ok(r.warnings.some(w => w.includes("not produced by a harness calculator")));
  assert.equal(r.estimatedCostUsd, null);
});
