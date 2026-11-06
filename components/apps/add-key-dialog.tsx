"use client";
/**
 * "Add key…": pick an AI provider and model (or name your own), paste the key, watch it being tested step by
 * step, then add it to your AI menu. Used by Deal Desk and Settings.
 */
import { ArrowLeft, Check, CircleAlert, Eye, EyeOff, KeyRound, Loader2, Minus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GridSDK, SavedAiKey } from "@/lib/sdk/types";
import { errText } from "./use-grid";

type Preset = { id: string; label: string; short: string; model: string; budget: string; baseUrl: string; keyHelp: string; models: string[] };
type Step = { id: string; label: string; status: "ok" | "warn" | "fail" | "skip" | "run" | "wait"; detail: string; ms?: number };

const PLACEHOLDER: Record<string, string> = { openrouter: "sk-or-v1-…", anthropic: "sk-ant-…", openai: "sk-…", gemini: "AIza…", custom: "API key" };
const TONE: Record<string, string> = { openrouter: "from-[#6d5dfc]/20", anthropic: "from-[#d97757]/20", openai: "from-[#10a37f]/20", gemini: "from-[#4285f4]/20", custom: "from-bronze/20" };
const PLAN: Step[] = [
  { id: "format", label: "Key format", status: "wait", detail: "" },
  { id: "connect", label: "Reach the provider and sign in", status: "wait", detail: "" },
  { id: "model", label: "Model answers", status: "wait", detail: "" },
  { id: "tools", label: "Uses GRID's tools", status: "wait", detail: "" },
];

export function AddKeyDialog({ grid, edit, onClose, onAdded }: { grid: GridSDK; edit?: SavedAiKey; onClose: () => void; onAdded: (k: SavedAiKey) => void }) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [stage, setStage] = useState<"pick" | "form" | "test">(edit ? "form" : "pick");
  const [f, setF] = useState({ provider: edit?.provider ?? "openrouter", name: edit?.name ?? "", model: edit?.model ?? "", budgetModel: edit?.budgetModel ?? "", baseUrl: edit?.baseUrl ?? "", apiKey: "" });
  const [show, setShow] = useState(false);
  const [advanced, setAdvanced] = useState(!!edit?.baseUrl);
  const [steps, setSteps] = useState<Step[]>(PLAN);
  const [ok, setOk] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    grid.ai.keys.presets().then(setPresets).catch((e) => setError(errText(e)));
  }, [grid]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const p = presets.find((x) => x.id === f.provider);
  const model = f.model || p?.model || "";
  const suggested = p ? `${p.short} · ${(model || "model").split("/").pop()}` : "";
  const form = useMemo(() => ({ id: edit?.id, provider: f.provider, name: f.name.trim(), apiKey: f.apiKey.trim() || undefined, model: f.model.trim(), budgetModel: f.budgetModel.trim(), baseUrl: f.baseUrl.trim() }), [f, edit]);
  const canTest = (edit || f.apiKey.trim().length >= 8) && (f.provider !== "custom" || (f.baseUrl.trim() && f.model.trim()));

  const runTest = async () => {
    setStage("test");
    setOk(null);
    setError("");
    setSteps(PLAN.map((s, i) => ({ ...s, status: i === 0 ? "run" : "wait" })));
    try {
      const r = await grid.ai.keys.test(form);
      // Reveal the results one step at a time.
      for (let i = 0; i < r.steps.length; i++) {
        await new Promise((res) => setTimeout(res, 380));
        setSteps((cur) => cur.map((s, j) => (j < i ? s : j === i ? { ...s, ...r.steps[i]!, status: r.steps[i]!.status } : j === i + 1 && r.steps[i]!.status !== "fail" ? { ...s, status: "run" } : s)));
      }
      setOk(r.ok);
    } catch (e) {
      setError(errText(e));
      setOk(false);
      setSteps(PLAN);
    }
  };

  const add = async () => {
    setSaving(true);
    try {
      const k = await grid.ai.keys.save(form);
      onAdded(k);
    } catch (e) {
      setError(errText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-navy/45 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={edit ? `Edit ${edit.name}` : "Add an AI key"}>
      <div className="ga-pop relative max-h-full w-full max-w-lg overflow-auto rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          {stage !== "pick" && !edit && (
            <button type="button" aria-label="Back" className="ga-icon-btn" onClick={() => setStage(stage === "test" ? "form" : "pick")}>
              <ArrowLeft size={16} />
            </button>
          )}
          <KeyRound size={18} className="text-bronze" aria-hidden />
          <h2 className="font-sans text-base font-semibold">{edit ? `Edit ${edit.name}` : stage === "pick" ? "Add an AI" : stage === "form" ? p?.label ?? "Your key" : "Testing your key"}</h2>
          <ol className="ml-auto flex gap-1" aria-label="Progress">
            {(["pick", "form", "test"] as const).map((s, i) => (
              <li key={s} className={`h-1.5 w-6 rounded-full ${["pick", "form", "test"].indexOf(stage) >= i ? "bg-bronze" : "bg-line"}`} />
            ))}
          </ol>
          <button type="button" aria-label="Close" className="ga-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {stage === "pick" && (
          <div className="p-5">
            <p className="mb-3 text-sm text-muted">Pick who provides the AI. You pay them directly for what you use; the Query Engine stays free and is always available.</p>
            <div className="grid gap-2" role="radiogroup" aria-label="AI provider">
              {presets.map((x, i) => (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={f.provider === x.id}
                  style={{ animationDelay: `${i * 40}ms` }}
                  onClick={() => {
                    setF({ ...f, provider: x.id, model: "", budgetModel: "", baseUrl: "" });
                    setStage("form");
                  }}
                  className={`ga-rise spotlight relative flex items-center gap-3 overflow-hidden rounded-xl border border-line bg-gradient-to-r ${TONE[x.id] ?? ""} to-white px-4 py-3 text-left transition-all hover:-translate-y-px hover:border-bronze`}
                >
                  <Sparkles size={16} className="shrink-0 text-bronze" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{x.label}</span>
                    <span className="block truncate text-xs text-muted">{x.models.length ? x.models.slice(0, 3).join(" · ") : "Any OpenAI-compatible service: enter its address and model"}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === "form" && p && (
          <form
            className="space-y-3.5 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (canTest) runTest();
            }}
          >
            <div>
              <label htmlFor="ak-model" className="label">
                Model
              </label>
              {p.models.length ? (
                <>
                  <select id="ak-model" className="field" value={p.models.includes(model) ? model : "__other"} onChange={(e) => setF({ ...f, model: e.target.value === "__other" ? " " : e.target.value })}>
                    {p.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                        {m === p.model ? " (recommended)" : ""}
                      </option>
                    ))}
                    <option value="__other">Other model…</option>
                  </select>
                  {!p.models.includes(model) && <input aria-label="Model name" className="field mt-1.5" placeholder="Exact model name from the provider" value={f.model.trim()} onChange={(e) => setF({ ...f, model: e.target.value })} autoFocus />}
                </>
              ) : (
                <input id="ak-model" className="field" placeholder="e.g. llama-3.3-70b-versatile" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} />
              )}
            </div>
            <div>
              <label htmlFor="ak-name" className="label">
                Name in your AI menu
              </label>
              <input id="ak-name" className="field" placeholder={suggested} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} />
              <p className="mt-1 text-[11px] text-muted">Leave empty to use “{suggested}”.</p>
            </div>
            <div>
              <label htmlFor="ak-key" className="label">
                API key {edit && <span className="font-normal text-muted">(leave empty to keep ••••{edit.keyHint})</span>}
              </label>
              <div className="relative">
                <input id="ak-key" className="field pr-10 font-mono" type={show ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder={PLACEHOLDER[f.provider]} value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} autoFocus={!edit} />
                <button type="button" aria-label={show ? "Hide key" : "Show key"} onClick={() => setShow(!show)} className="absolute top-1/2 right-2 -translate-y-1/2 text-muted hover:text-ink">
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted">Get one at {p.keyHelp}.</p>
            </div>
            {(f.provider === "custom" || advanced) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="ak-url" className="label">
                    Base URL {f.provider !== "custom" && <span className="font-normal text-muted">(optional)</span>}
                  </label>
                  <input id="ak-url" className="field" placeholder={p.baseUrl || "https://api.groq.com/openai/v1"} value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="ak-budget" className="label">
                    Cheaper model for quick answers <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <input id="ak-budget" className="field" placeholder={p.budget || "same as model"} value={f.budgetModel} onChange={(e) => setF({ ...f, budgetModel: e.target.value })} />
                </div>
              </div>
            )}
            {f.provider !== "custom" && !advanced && (
              <button type="button" className="text-xs underline" onClick={() => setAdvanced(true)}>
                Advanced settings
              </button>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-dark" disabled={!canTest}>
                Test connection
              </button>
            </div>
            <p className="text-[11px] text-muted">The key is sent only to GRID&apos;s server, encrypted there, and never shown again. Everyone who unlocks this desktop with the team PIN shares this account.</p>
          </form>
        )}

        {stage === "test" && (
          <div className="p-5">
            <ol className="space-y-2.5" aria-label="Connection test" data-testid="key-test">
              {steps.map((s) => (
                <li key={s.id} className={`flex gap-3 rounded-xl border px-3 py-2.5 transition-colors ${s.status === "fail" ? "border-bad/30 bg-bad-soft/60" : s.status === "warn" ? "border-warn/30 bg-warn-soft/60" : s.status === "ok" ? "border-ok/25 bg-ok-soft/50" : "border-line"}`} data-status={s.status}>
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full">
                    {s.status === "run" ? <Loader2 size={16} className="animate-spin text-bronze" /> : s.status === "ok" ? <Check size={16} className="text-ok" /> : s.status === "warn" ? <CircleAlert size={16} className="text-warn" /> : s.status === "fail" ? <X size={16} className="text-bad" /> : <Minus size={14} className="text-muted" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {s.label}
                      {s.ms !== undefined && <span className="ml-1.5 text-[11px] font-normal text-muted">{(s.ms / 1000).toFixed(1)} s</span>}
                    </span>
                    {s.detail && <span className="block text-xs text-muted">{s.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
            {error && (
              <p role="alert" className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
                {error}
              </p>
            )}
            {ok === true && (
              <p role="status" className="ga-rise mt-4 rounded-xl bg-ok-soft px-3 py-2.5 text-sm text-ok">
                It&apos;s up and running. Add it to your AI menu to start using it.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              {ok === false && (
                <button type="button" className="btn btn-ghost" onClick={() => setStage("form")}>
                  Back to fix it
                </button>
              )}
              {ok === true && (
                <>
                  <button type="button" className="btn btn-ghost" onClick={runTest}>
                    Test again
                  </button>
                  <button type="button" className="btn btn-dark" onClick={add} disabled={saving}>
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {edit ? "Save changes" : "Add to my AIs"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
