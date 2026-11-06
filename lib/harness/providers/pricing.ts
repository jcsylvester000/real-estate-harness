// API prices in US$ per 1 million tokens, used to show the cost of every turn.
// Source: provider price trackers checked late Oct–4 Nov 2026 (see the cost report). Update when
// providers change prices; unknown models simply report no cost estimate.

import type { TokenUsage } from "../harness/types";

export interface ModelPrice {
  input: number;
  cachedInput: number;
  output: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // Claude
  "claude-haiku-5-5": { input: 0.1, cachedInput: 0.01, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, cachedInput: 0.1, output: 10 },
  "claude-opus-5-5": { input: 4, cachedInput: 0.2, output: 20 },
  // OpenAI
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5 },
  "gpt-6.1-terra": { input: 1, cachedInput: 0.1, output: 5 },
  "gpt-6.1-sol": { input: 2, cachedInput: 0.2, output: 10 },
  "gpt-6-astra": { input: 10, cachedInput: 1, output: 50 },
  // Gemini (3.8 Flash and 4 Argon introductory prices end Dec 2026 / Jan 2027)
  "gemini-3.5-flash-lite": { input: 0.3, cachedInput: 0.03, output: 2.5 },
  "gemini-3.8-flash": { input: 1.5, cachedInput: 0.15, output: 7.5 },
  "gemini-3.1-pro": { input: 2, cachedInput: 0.2, output: 12 },
  "gemini-4-argon": { input: 4, cachedInput: 0.4, output: 20 },
  // Demo (no model, no cost)
  "grid-demo": { input: 0, cachedInput: 0, output: 0 },
};

/** Returns the US$ cost of the given usage, or null when the model's price is unknown. */
export function estimateCostUsd(model: string, usage: TokenUsage): number | null {
  const price = MODEL_PRICES[model];
  if (!price) return null;
  const usd = (usage.inputTokens * price.input + usage.cachedInputTokens * price.cachedInput + usage.outputTokens * price.output) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}
