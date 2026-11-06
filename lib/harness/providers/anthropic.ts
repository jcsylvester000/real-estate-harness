// Claude adapter (Anthropic Messages API). Marks the system prompt and tool list for prompt
// caching, which bills repeated instructions at about a tenth of the normal input price.

import type { ChatMessage, ModelProvider, ModelRequest, ModelResponse, ToolCall } from "../harness/types";
import { postJson, type PostOptions } from "./http";

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  http?: PostOptions;
}

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic" as const;
  readonly model: string;

  constructor(private readonly config: AnthropicConfig) {
    this.model = config.model;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const tools = req.tools.map((t, i) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
      ...(i === req.tools.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
    }));
    const body = {
      model: this.model,
      max_tokens: req.maxOutputTokens,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      tools,
      ...(req.toolChoice === "none" && tools.length ? { tool_choice: { type: "none" } } : {}),
      messages: toAnthropicMessages(req.messages),
    };
    const data = await postJson(
      `${this.config.baseUrl ?? "https://api.anthropic.com"}/v1/messages`,
      { "x-api-key": this.config.apiKey, "anthropic-version": "2023-06-01" },
      body,
      this.config.http,
    );
    const blocks: any[] = data.content ?? [];
    const toolCalls: ToolCall[] = blocks
      .filter(b => b.type === "tool_use")
      .map(b => ({ id: b.id, name: b.name, arguments: b.input ?? {} }));
    const u = data.usage ?? {};
    return {
      text: blocks.filter(b => b.type === "text").map(b => b.text).join(""),
      toolCalls,
      usage: {
        // Anthropic reports cached and cache-write tokens separately from fresh input tokens.
        inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
        cachedInputTokens: u.cache_read_input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
      },
      stopReason: data.stop_reason ?? "unknown",
    };
  }
}

/** Converts neutral messages; consecutive tool results are merged into one user turn as Claude requires. */
export function toAnthropicMessages(messages: ChatMessage[]): any[] {
  const out: any[] = [];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      const content: any[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const c of m.toolCalls ?? []) content.push({ type: "tool_use", id: c.id, name: c.name, input: c.arguments });
      out.push({ role: "assistant", content });
    } else {
      const block = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content };
      const last = out[out.length - 1];
      if (last?.role === "user" && Array.isArray(last.content) && last.content[0]?.type === "tool_result") last.content.push(block);
      else out.push({ role: "user", content: [block] });
    }
  }
  return out;
}
