// Provider-neutral types shared by the harness, the model adapters and the tools.
// Every model API (Claude, OpenAI-compatible, Gemini) is translated to and from these shapes,
// so the rulebook and tools never depend on one vendor.

/** A JSON-Schema subset that all three providers accept for tool parameters. */
export interface JsonSchema {
  type: "object" | "string" | "number" | "integer" | "boolean" | "array";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: string[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
}

/** A tool the model may call (e.g. a tax calculator). */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

/** A tool call requested by the model. `meta` carries provider-only data that must be sent back. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface ModelRequest {
  /** Stable instructions. Adapters mark this for prompt caching where the provider supports it. */
  system: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  maxOutputTokens: number;
  temperature?: number;
}

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface ModelResponse {
  text: string;
  toolCalls: ToolCall[];
  usage: TokenUsage;
  stopReason: string;
  /** Cost the provider itself reported for this call in US$ (OpenRouter does); preferred over the price table. */
  costUsd?: number;
}

/** One model behind one API. Implemented once per vendor in `src/providers/`. */
export interface ModelProvider {
  readonly id: ProviderId;
  readonly model: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export type ProviderId = "anthropic" | "openai" | "gemini" | "demo";
export type ModelTier = "balanced" | "budget";

/** What one harness turn returns to the app or chat page. */
export interface HarnessTurnResult {
  sessionId: string;
  reply: string;
  provider: ProviderId;
  model: string;
  toolTrace: { name: string; arguments: Record<string, unknown>; result: unknown }[];
  usage: TokenUsage;
  estimatedCostUsd: number | null;
  estimatedCostPhp: number | null;
  steps: number;
  warnings: string[];
}
