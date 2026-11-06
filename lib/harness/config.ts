// Harness settings from environment variables (Next.js loads .env.local). Read per call, so a
// deploy can change keys without a rebuild and builds work with no keys at all.

import type { ModelTier, ProviderId } from "./harness/types";

const env = (k: string, fallback = ""): string => process.env[k]?.trim() || fallback;
const num = (k: string, fallback: number): number => {
  const raw = process.env[k];
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) ? n : fallback;
};

export interface ProviderSettings {
  apiKey: string;
  models: Record<ModelTier, string>;
  baseUrl?: string;
}

export function harnessConfig() {
  return {
    defaultProvider: env("HARNESS_PROVIDER", "anthropic") as ProviderId,
    /** The keyless Demo provider (scripted, uses the real calculators). On unless HARNESS_DEMO_PROVIDER=false. */
    demoEnabled: env("HARNESS_DEMO_PROVIDER", "true") !== "false",
    providers: {
      anthropic: { apiKey: env("ANTHROPIC_API_KEY"), models: { balanced: env("ANTHROPIC_MODEL", "claude-sonnet-5-5"), budget: env("ANTHROPIC_BUDGET_MODEL", "claude-haiku-5-5") } },
      openai: { apiKey: env("OPENAI_API_KEY"), models: { balanced: env("OPENAI_MODEL", "gpt-6.1-sol"), budget: env("OPENAI_BUDGET_MODEL", "gpt-6-luna") }, baseUrl: env("OPENAI_BASE_URL", "https://api.openai.com/v1") },
      gemini: { apiKey: env("GEMINI_API_KEY"), models: { balanced: env("GEMINI_MODEL", "gemini-3.1-pro"), budget: env("GEMINI_BUDGET_MODEL", "gemini-3.5-flash-lite") } },
      demo: { apiKey: "", models: { balanced: "grid-demo", budget: "grid-demo" } },
    } satisfies Record<ProviderId, ProviderSettings>,
    limits: {
      // Netlify synchronous functions stop at about 60 s, so the defaults keep a turn well inside that.
      maxToolSteps: num("HARNESS_MAX_TOOL_STEPS", 6),
      maxOutputTokens: num("HARNESS_MAX_OUTPUT_TOKENS", 1500),
      maxCostPerTurnUsd: num("HARNESS_MAX_COST_PER_TURN_USD", 0.25),
      historyTurns: num("HARNESS_HISTORY_TURNS", 12),
      providerTimeoutMs: num("HARNESS_PROVIDER_TIMEOUT_MS", 25_000),
      /** Per-user AI spend per Manila calendar day, in pesos. 0 = no cap. */
      dailyCapPhp: num("GRID_DAILY_AI_CAP_PHP", 300),
    },
    usdToPhp: num("USD_TO_PHP", 63.5),
    brokerageName: env("GRID_BROKERAGE_NAME", "GRID Property Ventures"),
  };
}

export type HarnessConfig = ReturnType<typeof harnessConfig>;
