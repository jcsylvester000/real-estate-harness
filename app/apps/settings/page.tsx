"use client";
import { useEffect, useState } from "react";
import { AppFrame } from "@/components/apps/app-frame";
import { php } from "@/components/apps/result-view";
import { errText } from "@/components/apps/use-grid";
import { WALLPAPERS } from "@/lib/apps/wallpapers";
import type { GridSDK, SavedAiKey, UsageAllRow, UsageMine } from "@/lib/sdk/types";

const WALL_NAMES: Record<string, string> = { "wall-grid": "GRID blueprint", "wall-dusk": "Manila dusk", "wall-sand": "Sand", "wall-night": "Night" };

function Appearance({ grid }: { grid: GridSDK }) {
  return (
    <div>
      <h2 className="mb-3 font-sans text-sm font-semibold">Wallpaper</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {WALLPAPERS.map((w) => (
          <li key={w}>
            <button type="button" onClick={() => grid.call("ui.setWallpaper", { wallpaper: w })} className="w-full rounded-xl border border-line bg-white p-2 text-left text-xs hover:border-bronze">
              <span className={`${w} block h-20 rounded-lg`} aria-hidden />
              <span className="mt-1.5 block">{WALL_NAMES[w]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Usage({ grid, all }: { grid: GridSDK; all: boolean }) {
  const [mine, setMine] = useState<UsageMine | null>(null);
  const [rows, setRows] = useState<UsageAllRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    (all ? grid.usage.all().then(setRows) : grid.usage.mine().then(setMine)).catch((e) => setError(errText(e)));
  }, [grid, all]);
  if (error) return <p className="text-sm text-bad">{error}</p>;
  if (all)
    return (
      <table className="w-full text-left text-sm">
        <caption className="mb-2 text-left text-xs text-muted">AI cost per person, last 30 days (estimates from provider list prices).</caption>
        <thead>
          <tr className="bg-sand">
            {["Person", "Turns", "Today", "30 days"].map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows?.map((r) => (
            <tr key={r.username} className="border-b border-line">
              <td className="px-2 py-1.5">
                {r.displayName} <span className="text-xs text-muted">@{r.username}</span>
              </td>
              <td className="px-2 py-1.5 tabular-nums">{r.turns}</td>
              <td className="px-2 py-1.5 tabular-nums">{php(r.today)}</td>
              <td className="px-2 py-1.5 tabular-nums">{php(r.php)}</td>
            </tr>
          ))}
          {rows?.length === 0 && (
            <tr>
              <td colSpan={4} className="px-2 py-4 text-muted">
                No AI use yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    );
  if (!mine) return <p className="text-sm text-muted">Loading…</p>;
  const pct = mine.dailyCapPhp > 0 ? Math.min(100, (mine.today.php / mine.dailyCapPhp) * 100) : 0;
  return (
    <div className="space-y-5">
      <section className="card p-4">
        <h2 className="text-xs font-medium text-muted">Today (Manila time)</h2>
        <p className="mt-1 text-2xl tabular-nums">{php(mine.today.php)}</p>
        <p className="text-xs text-muted">
          {mine.today.turns} AI turns{mine.dailyCapPhp > 0 ? ` · daily allowance ${php(mine.dailyCapPhp)}` : ""}
        </p>
        {mine.dailyCapPhp > 0 && (
          <div className="mt-2 h-2 overflow-hidden rounded bg-sand" role="meter" aria-valuemin={0} aria-valuemax={mine.dailyCapPhp} aria-valuenow={mine.today.php} aria-label="AI allowance used today">
            <div className="h-full bg-bronze" style={{ width: `${pct}%` }} />
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 font-sans text-sm font-semibold">Last 30 days by model</h2>
        {mine.last30Days.length === 0 ? (
          <p className="text-sm text-muted">No AI use yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white text-sm">
            {mine.last30Days.map((r) => (
              <li key={r.model} className="flex justify-between px-3 py-2">
                <span>
                  {r.model} <span className="text-xs text-muted">{r.turns} turns</span>
                </span>
                <span className="tabular-nums">{php(r.php)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const KEY_PRESETS: Record<string, { label: string; model: string; budget: string; baseUrl: string; help: string; placeholder: string }> = {
  openrouter: { label: "OpenRouter (many models, one key)", model: "openai/gpt-4o", budget: "openai/gpt-4o-mini", baseUrl: "https://openrouter.ai/api/v1", help: "openrouter.ai → Keys", placeholder: "sk-or-v1-…" },
  anthropic: { label: "Claude (Anthropic)", model: "claude-sonnet-5-5", budget: "claude-haiku-5-5", baseUrl: "", help: "console.anthropic.com → API keys", placeholder: "sk-ant-…" },
  openai: { label: "OpenAI (ChatGPT)", model: "gpt-6.1-sol", budget: "gpt-6-luna", baseUrl: "https://api.openai.com/v1", help: "platform.openai.com → API keys", placeholder: "sk-…" },
  gemini: { label: "Google Gemini", model: "gemini-3.1-pro", budget: "gemini-3.5-flash-lite", baseUrl: "", help: "aistudio.google.com → Get API key", placeholder: "AIza…" },
  custom: { label: "Other OpenAI-compatible (Groq, DeepSeek, Ollama…)", model: "", budget: "", baseUrl: "", help: "your provider's dashboard", placeholder: "API key" },
};

function AiSetup({ grid }: { grid: GridSDK }) {
  const [keys, setKeys] = useState<SavedAiKey[]>([]);
  const [team, setTeam] = useState<{ id: string; label: string }[]>([]);
  const [form, setForm] = useState({ provider: "openrouter", apiKey: "", model: "", budgetModel: "", baseUrl: "" });
  const [busy, setBusy] = useState<"" | "test" | "save">("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const preset = KEY_PRESETS[form.provider]!;
  const saved = keys.find((k) => k.provider === form.provider);

  const load = () => {
    grid.ai.keys.list().then(setKeys).catch(() => {});
    grid.ai
      .status()
      .then((st) => setTeam(st.providers.filter((p) => p.id !== "demo" && !p.id.startsWith("mine:") && p.configured)))
      .catch(() => {});
  };
  useEffect(load, [grid]);

  const pickProvider = (provider: string) => {
    const k = keys.find((x) => x.provider === provider);
    setForm({ provider, apiKey: "", model: k?.model ?? "", budgetModel: k?.budgetModel ?? "", baseUrl: k?.baseUrl ?? "" });
    setResult(null);
  };
  const payload = () => ({ provider: form.provider, apiKey: form.apiKey.trim() || undefined, model: form.model.trim(), budgetModel: form.budgetModel.trim(), baseUrl: form.baseUrl.trim() });

  const test = async () => {
    setBusy("test");
    setResult(null);
    try {
      const r = await grid.ai.keys.test(payload());
      setResult(r.ok ? { ok: true, text: `It works: ${r.model} answered in ${(r.ms / 1000).toFixed(1)} s.` } : { ok: false, text: r.error ?? "The provider refused the request." });
    } catch (e) {
      setResult({ ok: false, text: errText(e) });
    } finally {
      setBusy("");
    }
  };
  const save = async () => {
    setBusy("save");
    try {
      await grid.ai.keys.save(payload());
      setForm((f) => ({ ...f, apiKey: "" }));
      setResult({ ok: true, text: "Saved. Pick it in Deal Desk's provider menu when you want AI; the Query Engine stays the default." });
      load();
    } catch (e) {
      setResult({ ok: false, text: errText(e) });
    } finally {
      setBusy("");
    }
  };
  const remove = async (k: SavedAiKey) => {
    if (!(await grid.ui.confirm(`Remove your ${k.label} key?`, { danger: true, okLabel: "Remove" }))) return;
    await grid.ai.keys.remove(k.provider).catch((e) => grid.ui.notify(errText(e), { tone: "bad" }));
    load();
  };

  return (
    <div className="max-w-2xl space-y-5">
      <section className="rounded-xl border border-info/25 bg-info-soft/70 p-4">
        <h2 className="font-sans text-sm font-semibold text-info">Default: Query Engine (no AI)</h2>
        <p className="mt-1 text-sm text-ink-2">
          Grid Agentic works fully without AI: search, matching, calculators, lenders, Property Teaser and the Deal Desk Query Engine. To use AI, add your own key below and pick it in Deal Desk&apos;s provider menu. You can switch back to the Query Engine any time.
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-sans text-sm font-semibold">Your AI keys</h2>
        {keys.length === 0 ? (
          <p className="text-sm text-muted">No keys yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-white text-sm" data-testid="saved-keys">
            {keys.map((k) => (
              <li key={k.provider} className="flex items-center gap-3 px-3 py-2">
                <span className="size-2 rounded-full bg-ok" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{k.label}</span>
                  <span className="block text-xs text-muted">
                    Key ••••{k.keyHint} · {k.model}
                    {k.budgetModel && k.budgetModel !== k.model ? ` / ${k.budgetModel}` : ""}
                  </span>
                </span>
                <button type="button" className="text-xs underline" onClick={() => pickProvider(k.provider)}>
                  Edit
                </button>
                <button type="button" className="text-xs text-bad underline" onClick={() => remove(k)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        className="card space-y-3 p-4"
        aria-label="Add an AI key"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2 className="font-sans text-sm font-semibold">{saved ? `Update ${preset.label}` : "Add a key"}</h2>
        <div>
          <label htmlFor="k-provider" className="label">
            AI provider
          </label>
          <select id="k-provider" className="field" value={form.provider} onChange={(e) => pickProvider(e.target.value)}>
            {Object.entries(KEY_PRESETS).map(([id, p]) => (
              <option key={id} value={id}>
                {p.label}
                {keys.some((k) => k.provider === id) ? " (saved)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="k-key" className="label">
            API key {saved && <span className="font-normal text-muted">(leave empty to keep ••••{saved.keyHint})</span>}
          </label>
          <input id="k-key" className="field font-mono" type="password" autoComplete="off" spellCheck={false} placeholder={preset.placeholder} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
          <p className="mt-1 text-xs text-muted">Get one at {preset.help}. Usage is billed by your provider to your account.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="k-model" className="label">
              Model
            </label>
            <input id="k-model" className="field" placeholder={preset.model || "model name"} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div>
            <label htmlFor="k-budget" className="label">
              Budget model (optional)
            </label>
            <input id="k-budget" className="field" placeholder={preset.budget || "cheaper model"} value={form.budgetModel} onChange={(e) => setForm({ ...form, budgetModel: e.target.value })} />
          </div>
        </div>
        {(form.provider === "custom" || form.provider === "openrouter" || form.provider === "openai") && (
          <div>
            <label htmlFor="k-url" className="label">
              Base URL {form.provider !== "custom" && <span className="font-normal text-muted">(optional)</span>}
            </label>
            <input id="k-url" className="field" placeholder={preset.baseUrl || "https://api.groq.com/openai/v1"} value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
          </div>
        )}
        {result && (
          <p role="status" className={`rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
            {result.text}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={test}>
            {busy === "test" ? "Testing…" : "Test connection"}
          </button>
          <button type="submit" className="btn btn-dark" disabled={!!busy}>
            {busy === "save" ? "Saving…" : saved ? "Save changes" : "Save key"}
          </button>
        </div>
        <p className="text-[11px] text-muted">
          Keys are encrypted on the server and never shown again. Everyone who unlocks this desktop with the team PIN shares the same account, so they can use these keys too. Daily AI spend per person is capped (GRID_DAILY_AI_CAP_PHP).
        </p>
      </form>

      {team.length > 0 && (
        <p className="text-xs text-muted">Team keys set by an admin on the server: {team.map((t) => t.label.replace("Team key · ", "")).join(", ")}.</p>
      )}
    </div>
  );
}

function Apps({ grid }: { grid: GridSDK }) {
  return (
    <div className="max-w-xl space-y-4 text-sm">
      <h2 className="font-sans text-sm font-semibold">Apps and permissions</h2>
      <p className="text-muted">See every app, install a third-party app, take back permissions you gave an app, and read the developer SDK guide.</p>
      <button type="button" className="btn btn-dark" onClick={() => grid.ui.openApp("app-center")}>
        Open App Center
      </button>
    </div>
  );
}

function Settings({ grid }: { grid: GridSDK }) {
  const isAdmin = grid.user?.role === "admin";
  const tabs = [
    ["appearance", "Appearance"],
    ["ai", "AI setup"],
    ["usage", "AI usage"],
    ...(isAdmin ? [["team-usage", "Team AI usage"]] : []),
    ["apps", "Apps"],
  ] as [string, string][];
  const start = typeof grid.launchArgs.tab === "string" && tabs.some(([k]) => k === grid.launchArgs.tab) ? (grid.launchArgs.tab as string) : "appearance";
  const [tab, setTab] = useState(start);
  return (
    <div className="app-shell md:flex-row">
      <nav aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-white p-2 md:w-48 md:flex-col md:border-r md:border-b-0">
        {tabs.map(([k, t]) => (
          <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)} className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm ${tab === k ? "bg-bronze-soft font-medium" : "hover:bg-sand"}`}>
            {t}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {tab === "appearance" && <Appearance grid={grid} />}
        {tab === "ai" && <AiSetup grid={grid} />}
        {tab === "usage" && <Usage grid={grid} all={false} />}
        {tab === "apps" && <Apps grid={grid} />}
        {tab === "team-usage" && <Usage grid={grid} all />}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return <AppFrame>{(grid) => <Settings grid={grid} />}</AppFrame>;
}
