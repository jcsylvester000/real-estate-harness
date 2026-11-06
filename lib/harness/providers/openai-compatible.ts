// OpenAI adapter using the Chat Completions format. Because many vendors copy this format
// (OpenRouter, Groq, DeepSeek, Mistral, Azure OpenAI, local Ollama/vLLM), changing the base URL
// and model is enough to run the harness on any of them. OpenAI caches repeated prompts automatically.

import type { ChatMessage, ModelProvider, ModelRequest, ModelResponse, ToolCall } from "../harness/types";
import { postJson, type PostOptions } from "./http";

export interface OpenAICompatibleConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  /** Extra headers, e.g. OpenRouter's HTTP-Referer or Azure's api-key. */
  extraHeaders?: Record<string, string>;
  http?: PostOptions;
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id = "openai" as const;
  readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly config: OpenAICompatibleConfig) {
    this.model = config.model;
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    // OpenAI's newer models take max_completion_tokens; most compatible servers still expect max_tokens.
    const isOpenAI = this.baseUrl.includes("api.openai.com");
    const isOpenRouter = this.baseUrl.includes("openrouter.ai");
    const body = {
      model: this.model,
      ...(isOpenAI ? { max_completion_tokens: req.maxOutputTokens } : { max_tokens: req.maxOutputTokens }),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      messages: [{ role: "system", content: req.system }, ...toOpenAIMessages(req.messages)],
      tools: req.tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
      // OpenRouter: return the real charge for this call in usage.cost (US$).
      ...(isOpenRouter ? { usage: { include: true } } : {}),
    };
    const data = await postJson(
      `${this.baseUrl}/chat/completions`,
      { authorization: `Bearer ${this.config.apiKey}`, ...this.config.extraHeaders },
      body,
      this.config.http,
    );
    const choice = data.choices?.[0] ?? {};
    const msg = choice.message ?? {};
    const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((c: any) => ({
      id: c.id,
      name: c.function?.name,
      arguments: safeParse(c.function?.arguments),
    }));
    const u = data.usage ?? {};
    const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
    return {
      text: typeof msg.content === "string" ? msg.content : "",
      toolCalls,
      usage: { inputTokens: (u.prompt_tokens ?? 0) - cached, cachedInputTokens: cached, outputTokens: u.completion_tokens ?? 0 },
      stopReason: choice.finish_reason ?? "unknown",
      ...(typeof u.cost === "number" && Number.isFinite(u.cost) ? { costUsd: u.cost } : {}),
    };
  }
}

export function toOpenAIMessages(messages: ChatMessage[]): any[] {
  return messages.map(m => {
    if (m.role === "user") return { role: "user", content: m.content };
    if (m.role === "tool") return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    return {
      role: "assistant",
      content: m.content || null,
      ...(m.toolCalls?.length
        ? { tool_calls: m.toolCalls.map(c => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) }
        : {}),
    };
  });
}

function safeParse(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return (raw as Record<string, unknown>) ?? {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
