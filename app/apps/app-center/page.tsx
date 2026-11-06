"use client";
import { Code, ExternalLink, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/apps/app-frame";
import { errText } from "@/components/apps/use-grid";
import { AppTile, ICON_KEYS } from "@/components/desktop/icons";
import type { AppInfo } from "@/lib/apps/catalog";
import { GRANTABLE, PERMISSIONS, type Permission } from "@/lib/apps/permissions";
import type { GridSDK } from "@/lib/sdk/types";

const SNIPPET = `<!doctype html>
<script src="https://YOUR-GRID-HOST/sdk/grid.js"></script>
<script>
  grid.ready.then(async () => {
    // Asks the user once for "Run real-estate calculators"
    const r = await grid.tools.run("compute_loan_amortization", {
      propertyPrice: 7600000, downPaymentPercent: 20,
      annualInterestRatePercent: 7, termYears: 20,
    });
    grid.ui.notify("Monthly: ₱" + r.monthlyPayment.toLocaleString());
  });
</script>`;

function InstallForm({ grid, onDone }: { grid: GridSDK; onDone: () => void }) {
  const [f, setF] = useState({ id: "", name: "", description: "", url: "", icon: "app", width: 720, height: 520, permissions: [] as Permission[] });
  const [error, setError] = useState("");
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="card space-y-3 p-4"
      aria-label="Install a third-party app"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await grid.apps.install(f);
          await grid.call("ui.refreshApps");
          grid.ui.notify(`${f.name} installed. It is now on everyone's desktop.`, { tone: "ok" });
          onDone();
        } catch (err) {
          setError(errText(err));
        }
      }}
    >
      <h2 className="font-sans text-sm font-semibold">Install a third-party app</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="a-id" className="label">
            App id
          </label>
          <input id="a-id" className="field" required pattern="[a-z0-9][a-z0-9-]{1,39}" placeholder="loan-widget" value={f.id} onChange={(e) => set("id", e.target.value.toLowerCase())} />
        </div>
        <div>
          <label htmlFor="a-name" className="label">
            Name
          </label>
          <input id="a-name" className="field" required maxLength={40} value={f.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="a-url" className="label">
            URL (https://… or /path on this site)
          </label>
          <input id="a-url" className="field" required placeholder="/sample-apps/loan-widget/index.html" value={f.url} onChange={(e) => set("url", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="a-desc" className="label">
            Description
          </label>
          <input id="a-desc" className="field" maxLength={200} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div>
          <label htmlFor="a-icon" className="label">
            Icon
          </label>
          <select id="a-icon" className="field" value={f.icon} onChange={(e) => set("icon", e.target.value)}>
            {ICON_KEYS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="a-w" className="label">
              Width
            </label>
            <input id="a-w" className="field" type="number" min={320} max={1600} value={f.width} onChange={(e) => set("width", Number(e.target.value))} />
          </div>
          <div>
            <label htmlFor="a-h" className="label">
              Height
            </label>
            <input id="a-h" className="field" type="number" min={240} max={1200} value={f.height} onChange={(e) => set("height", Number(e.target.value))} />
          </div>
        </div>
      </div>
      <fieldset>
        <legend className="label">Permissions the app may ask for (each user still decides)</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {GRANTABLE.map((p) => (
            <label key={p} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-navy"
                checked={f.permissions.includes(p)}
                onChange={(e) => set("permissions", e.target.checked ? [...f.permissions, p] : f.permissions.filter((x) => x !== p))}
              />
              <span>
                <span className="font-mono text-xs">{p}</span> <span className="text-muted">{PERMISSIONS[p]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-dark">
          Install
        </button>
      </div>
    </form>
  );
}

function AppCenter({ grid }: { grid: GridSDK }) {
  const isAdmin = grid.user?.role === "admin";
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [grants, setGrants] = useState<{ appId: string; permission: string }[]>([]);
  const [installing, setInstalling] = useState(false);
  const [tab, setTab] = useState<"apps" | "dev">("apps");

  const load = useCallback(async () => {
    try {
      const [a, g] = await Promise.all([grid.apps.list(), grid.apps.grants()]);
      setApps(a);
      setGrants(g);
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  }, [grid]);
  useEffect(() => {
    // Data load on mount and when the folder changes; state updates happen after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const revoke = async (appId: string, permission: string) => {
    await grid.apps.revoke(appId, permission);
    grid.ui.notify("Permission removed. The app will ask again next time.", { tone: "ok" });
    load();
  };
  const uninstall = async (a: AppInfo) => {
    if (!(await grid.ui.confirm(`Uninstall ${a.name} for everyone?`, { danger: true, okLabel: "Uninstall" }))) return;
    try {
      await grid.apps.uninstall(a.id);
      await grid.call("ui.refreshApps");
      load();
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };

  return (
    <div className="app-shell">
      <div role="tablist" className="flex gap-1 border-b border-line bg-white px-2 pt-2">
        {(
          [
            ["apps", "Apps"],
            ["dev", "Developer SDK"],
          ] as const
        ).map(([k, t]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-t-lg border-b-2 px-3 py-2 text-sm ${tab === k ? "border-bronze font-medium" : "border-transparent text-muted"}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {tab === "apps" && (
          <>
            {isAdmin && !installing && (
              <button type="button" className="btn btn-dark" onClick={() => setInstalling(true)}>
                <Plus size={15} aria-hidden /> Install an app
              </button>
            )}
            {installing && (
              <InstallForm
                grid={grid}
                onDone={() => {
                  setInstalling(false);
                  load();
                }}
              />
            )}
            <ul className="grid gap-3 sm:grid-cols-2">
              {apps.map((a) => {
                const mine = grants.filter((g) => g.appId === a.id);
                return (
                  <li key={a.id} className="card flex flex-col p-4">
                    <div className="flex items-start gap-3">
                      <AppTile icon={a.icon} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {a.name}{" "}
                          <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] uppercase ${a.kind === "builtin" ? "bg-sand text-ink-2" : "bg-info-soft text-info"}`}>{a.kind === "builtin" ? "built-in" : "third party"}</span>
                        </p>
                        <p className="text-xs text-muted">{a.description}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-[11px] text-muted">Can ask for: {a.permissions.length ? a.permissions.join(", ") : "nothing"}</p>
                    {a.kind === "external" && (
                      <div className="mt-2 space-y-1">
                        {mine.length === 0 && <p className="text-xs text-muted">You have not allowed anything yet.</p>}
                        {mine.map((g) => (
                          <p key={g.permission} className="flex items-center gap-2 text-xs">
                            <ShieldCheck size={13} className="text-ok" aria-hidden /> Allowed: {g.permission}
                            <button type="button" className="ml-auto underline" onClick={() => revoke(a.id, g.permission)}>
                              Remove
                            </button>
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="mt-auto flex gap-2 pt-3">
                      <button type="button" className="btn btn-ghost min-h-8 px-2.5 text-xs" onClick={() => grid.ui.openApp(a.id)}>
                        <ExternalLink size={13} aria-hidden /> Open
                      </button>
                      {isAdmin && a.kind === "external" && (
                        <button type="button" className="btn btn-ghost min-h-8 px-2.5 text-xs text-bad" onClick={() => uninstall(a)}>
                          <Trash2 size={13} aria-hidden /> Uninstall
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {tab === "dev" && (
          <div className="max-w-3xl space-y-3 text-sm">
            <h1 className="flex items-center gap-2 font-sans text-lg font-semibold">
              <Code size={18} aria-hidden /> Build an app for Grid Agentic
            </h1>
            <p>
              An app is any web page. It runs in a sandboxed window and loads <code className="rounded bg-sand px-1">/sdk/grid.js</code>. The SDK talks only to the desktop, which checks permissions and calls the server for you. The app never sees the user&apos;s session.
            </p>
            <pre className="overflow-x-auto rounded-lg bg-navy p-3 font-mono text-[12px] text-cream">{SNIPPET}</pre>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <code>grid.ai.chat(text)</code>: one Deal Desk AI turn (reply, calculations used, cost).
              </li>
              <li>
                <code>grid.tools.run(name, args)</code>: harness calculators with no AI cost. <code>grid.tools.list()</code> returns their schemas.
              </li>
              <li>
                <code>grid.listings.search(filter)</code>, <code>grid.fs.*</code> (the user&apos;s files), <code>grid.kv.*</code> (private storage for your app).
              </li>
              <li>
                <code>grid.ui.alert / confirm / prompt / notify / pickFile / setTitle / close</code>.
              </li>
            </ul>
            <p>Try the sample: install id <code>loan-widget</code>, URL <code>/sample-apps/loan-widget/index.html</code>, permissions <code>tools</code> and <code>ai</code>.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AppCenterPage() {
  return <AppFrame>{(grid) => <AppCenter grid={grid} />}</AppFrame>;
}
