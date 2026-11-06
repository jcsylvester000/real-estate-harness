"use client";
import { useEffect, useState } from "react";
import { AppFrame } from "@/components/apps/app-frame";
import { php } from "@/components/apps/result-view";
import { errText } from "@/components/apps/use-grid";
import { WALLPAPERS } from "@/lib/apps/wallpapers";
import type { GridSDK, UsageAllRow, UsageMine } from "@/lib/sdk/types";

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

function AiSetup({ grid }: { grid: GridSDK }) {
  const [st, setSt] = useState<{ realAi: boolean; providers: { id: string; label: string; configured: boolean }[] } | null>(null);
  useEffect(() => {
    grid.ai.status().then(setSt).catch(() => {});
  }, [grid]);
  const works = [
    ["Property Finder", "Plain-language search of the listings index: “2BR condo for rent in BGC under 60k”."],
    ["Listings", "Browse, edit and import GRID listing exports. The search index updates on every change."],
    ["Calculators", "Taxes and fees, loan payments, commission, Maceda refunds, foreign ownership."],
    ["Deal Desk (Query Engine)", "Answers listing, matching, loan, calculator and document questions without an AI, in English, Filipino or Taglish. Free-form writing needs a key."],
    ["Files, Notes, App Center, Settings", "Everything works as normal."],
  ];
  return (
    <div className="max-w-2xl space-y-5">
      <section className={`rounded-xl border p-4 ${st?.realAi ? "border-ok/30 bg-ok-soft" : "border-warn/30 bg-warn-soft"}`}>
        <h2 className={`font-sans text-sm font-semibold ${st?.realAi ? "text-ok" : "text-warn"}`}>{st ? (st.realAi ? "AI is connected" : "No AI key yet: Query Engine mode") : "Checking…"}</h2>
        <p className="mt-1 text-sm text-ink-2">
          {st?.realAi
            ? "Deal Desk can hold full conversations. It still answers only with GRID's calculators, rulebook and listings index."
            : "Grid Agentic works without AI. Only Deal Desk's open conversation needs a key."}
        </p>
      </section>
      {st && (
        <table className="w-full text-left text-sm">
          <caption className="mb-2 text-left text-xs text-muted">AI providers on this server (keys are never shown).</caption>
          <tbody>
            {st.providers
              .filter((p) => p.id !== "demo")
              .map((p) => (
                <tr key={p.id} className="border-b border-line">
                  <td className="py-2">{p.label}</td>
                  <td className="py-2 text-right">{p.configured ? <span className="text-ok">Key set</span> : <span className="text-muted">No key</span>}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
      <section>
        <h2 className="mb-2 font-sans text-sm font-semibold">What works without AI</h2>
        <ul className="divide-y divide-line rounded-lg border border-line bg-white text-sm">
          {works.map(([a, b]) => (
            <li key={a} className="px-3 py-2">
              <span className="font-medium">{a}</span>
              <span className="block text-xs text-muted">{b}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="text-sm">
        <h2 className="mb-2 font-sans text-sm font-semibold">Turning AI on (admin)</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Get an API key from Anthropic (Claude), OpenAI or Google (Gemini).
          </li>
          <li>
            Add it to the server: <code className="rounded bg-sand px-1">ANTHROPIC_API_KEY</code>, <code className="rounded bg-sand px-1">OPENAI_API_KEY</code> or <code className="rounded bg-sand px-1">GEMINI_API_KEY</code> in <code className="rounded bg-sand px-1">.env.local</code>, or in Netlify&apos;s environment variables.
          </li>
          <li>Restart the app (or redeploy). The taskbar badge turns green.</li>
        </ol>
        <p className="mt-2 text-xs text-muted">Each person&apos;s AI spend is capped per day (GRID_DAILY_AI_CAP_PHP). Calculators and search are free.</p>
      </section>
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
