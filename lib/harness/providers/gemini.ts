// Gemini adapter (Google Generative Language API, generateContent).
// Gemini 3+ attaches a "thought signature" to function calls that must be sent back unchanged
// on the next request, otherwise multi-step tool use fails; it is kept in ToolCall.meta.

import type { ChatMessage, ModelProvider, ModelRequest, ModelResponse, ToolCall } from "../harness/types";
import { postJson, type PostOptions } from "./http";

export interface GeminiConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  http?: PostOptions;
}

export class GeminiProvider implements ModelProvider {
  readonly id = "gemini" as const;
  readonly model: string;

  constructor(private readonly config: GeminiConfig) {
    this.model = config.model;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: toGeminiContents(req.messages),
      ...(req.tools.length ? { tools: [{ functionDeclarations: req.tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }] } : {}),
      ...(req.tools.length && req.toolChoice === "none" ? { toolConfig: { functionCallingConfig: { mode: "NONE" } } } : {}),
      generationConfig: {
        maxOutputTokens: req.maxOutputTokens,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      },
    };
    const base = this.config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    const data = await postJson(
      `${base}/models/${encodeURIComponent(this.model)}:generateContent`,
      { "x-goog-api-key": this.config.apiKey },
      body,
      this.config.http,
    );
    const candidate = data.candidates?.[0] ?? {};
    const parts: any[] = candidate.content?.parts ?? [];
    const toolCalls: ToolCall[] = parts
      .filter(p => p.functionCall)
      .map((p, i) => ({
        id: p.functionCall.id ?? `gemini-call-${Date.now()}-${i}`,
        name: p.functionCall.name,
        arguments: p.functionCall.args ?? {},
        meta: p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : undefined,
      }));
    const u = data.usageMetadata ?? {};
    const cached = u.cachedContentTokenCount ?? 0;
    return {
      text: parts.filter(p => typeof p.text === "string" && !p.thought).map(p => p.text).join(""),
      toolCalls,
      usage: {
        inputTokens: (u.promptTokenCount ?? 0) - cached,
        cachedInputTokens: cached,
        // Thinking tokens are billed as output.
        outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
      },
      stopReason: candidate.finishReason ?? "unknown",
    };
  }
}

/** Converts neutral messages; consecutive tool results become one "user" turn of functionResponse parts. */
export function toGeminiContents(messages: ChatMessage[]): any[] {
  const out: any[] = [];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", parts: [{ text: m.content }] });
    else if (m.role === "assistant") {
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls ?? []) {
        parts.push({
          functionCall: { name: c.name, args: c.arguments, ...(c.id.startsWith("gemini-call-") ? {} : { id: c.id }) },
          ...(c.meta?.thoughtSignature ? { thoughtSignature: c.meta.thoughtSignature } : {}),
        });
      }
      out.push({ role: "model", parts });
    } else {
      const part = { functionResponse: { name: m.name, response: { result: parseOrText(m.content) } } };
      const last = out[out.length - 1];
      if (last?.role === "user" && last.parts[0]?.functionResponse) last.parts.push(part);
      else out.push({ role: "user", parts: [part] });
    }
  }
  return out;
}

function parseOrText(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
