// Builds the right adapter for a provider id and tier from configuration.

import type { ProviderSettings } from "../config";
import type { ModelProvider, ModelTier, ProviderId } from "../harness/types";
import { AnthropicProvider } from "./anthropic";
import { DemoProvider } from "./demo";
import { GeminiProvider } from "./gemini";
import type { PostOptions } from "./http";
import { OpenAICompatibleProvider } from "./openai-compatible";

export { AnthropicProvider, DemoProvider, GeminiProvider, OpenAICompatibleProvider };
export const PROVIDER_IDS: ProviderId[] = ["anthropic", "openai", "gemini", "demo"];

/** @throws when the provider has no API key configured */
export function createProvider(id: ProviderId, settings: ProviderSettings, tier: ModelTier = "balanced", modelOverride?: string, http?: PostOptions): ModelProvider {
  if (id === "demo") return new DemoProvider();
  if (!settings.apiKey) throw new Error(`No API key configured for "${id}". Add it to .env.local (or the Netlify environment).`);
  const model = modelOverride || settings.models[tier];
  switch (id) {
    case "anthropic":
      return new AnthropicProvider({ apiKey: settings.apiKey, model, http });
    case "openai":
      return new OpenAICompatibleProvider({ apiKey: settings.apiKey, model, baseUrl: settings.baseUrl, http });
    case "gemini":
      return new GeminiProvider({ apiKey: settings.apiKey, model, http });
    default:
      throw new Error(`Unknown provider "${id as string}".`);
  }
}
