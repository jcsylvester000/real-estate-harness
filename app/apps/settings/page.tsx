"use client";
import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/apps/app-frame";
import { php } from "@/components/apps/result-view";
import { errText } from "@/components/apps/use-grid";
import { WALLPAPERS } from "@/lib/apps/wallpapers";
import type { GridSDK, UsageAllRow, UsageMine, UserRow } from "@/lib/sdk/types";

const WALL_NAMES: Record<string, string> = { "wall-grid": "GRID blueprint", "wall-dusk": "Manila dusk", "wall-sand": "Sand", "wall-night": "Night" };

function Account({ grid }: { grid: GridSDK }) {
  const [name, setName] = useState(grid.user?.displayName ?? "");
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="max-w-md space-y-6">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await grid.account.update({ displayName: name });
            setMsg({ ok: true, text: "Name saved. It shows after you reload the desktop." });
          } catch (err) {
            setMsg({ ok: false, text: errText(err) });
          }
        }}
      >
        <h2 className="font-sans text-sm font-semibold">Your name</h2>
        <label htmlFor="dn" className="label">
          Display name
        </label>
        <input id="dn" className="field" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn btn-dark">
          Save name
        </button>
      </form>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.next !== pw.confirm) return setMsg({ ok: false, text: "The two new passwords do not match." });
          try {
            await grid.account.changePassword({ current: pw.current, next: pw.next });
            setPw({ current: "", next: "", confirm: "" });
            setMsg({ ok: true, text: "Password changed. Other devices were signed out." });
          } catch (err) {
            setMsg({ ok: false, text: errText(err) });
          }
        }}
      >
        <h2 className="font-sans text-sm font-semibold">Change password</h2>
        {(["current", "next", "confirm"] as const).map((k) => (
          <div key={k}>
            <label htmlFor={`pw-${k}`} className="label">
              {{ current: "Current password", next: "New password (15+ characters)", confirm: "Repeat new password" }[k]}
            </label>
            <input id={`pw-${k}`} type="password" className="field" autoComplete={k === "current" ? "current-password" : "new-password"} value={pw[k]} onChange={(e) => setPw({ ...pw, [k]: e.target.value })} />
          </div>
        ))}
        <button type="submit" className="btn btn-dark">
          Change password
        </button>
      </form>
      {msg && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

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

function Users({ grid }: { grid: GridSDK }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [f, setF] = useState({ username: "", displayName: "", password: "", role: "salesperson" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => grid.users.list().then(setRows).catch((e) => setMsg({ ok: false, text: errText(e) })), [grid]);
  useEffect(() => {
    load();
  }, [load]);
  const update = async (userId: string, patch: Record<string, unknown>) => {
    try {
      await grid.users.update({ userId, ...patch });
      load();
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };
  const reset = async (u: UserRow) => {
    const temp = await grid.ui.prompt(`Temporary password for ${u.username} (15+ characters). They must change it at next sign-in.`, "");
    if (!temp) return;
    try {
      await grid.users.resetPassword({ userId: u.id, temporaryPassword: temp });
      grid.ui.notify(`Password reset for ${u.username}. Tell them in person or by phone, not by chat.`, { tone: "ok" });
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };
  return (
    <div className="space-y-5">
      <form
        className="card grid gap-3 p-4 sm:grid-cols-2"
        aria-label="Add a user"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await grid.users.create(f);
            setMsg({ ok: true, text: `${f.username} created. They must choose their own password at first sign-in.` });
            setF({ username: "", displayName: "", password: "", role: "salesperson" });
            load();
          } catch (err) {
            setMsg({ ok: false, text: errText(err) });
          }
        }}
      >
        <h2 className="font-sans text-sm font-semibold sm:col-span-2">Add a user</h2>
        <div>
          <label htmlFor="u-name" className="label">
            Username
          </label>
          <input id="u-name" className="field" required value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        </div>
        <div>
          <label htmlFor="u-dn" className="label">
            Display name
          </label>
          <input id="u-dn" className="field" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
        </div>
        <div>
          <label htmlFor="u-pw" className="label">
            Temporary password (15+ characters)
          </label>
          <input id="u-pw" className="field" type="password" autoComplete="new-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </div>
        <div>
          <label htmlFor="u-role" className="label">
            Role
          </label>
          <select id="u-role" className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="salesperson">Salesperson</option>
            <option value="broker">Broker (can edit listings)</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn btn-dark">
            Create user
          </button>
        </div>
        {msg && (
          <p role="status" className={`rounded-lg px-3 py-2 text-sm sm:col-span-2 ${msg.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
            {msg.text}
          </p>
        )}
      </form>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-sand">
            {["User", "Role", "Status", ""].map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b border-line">
              <td className="px-2 py-1.5">
                {u.displayName} <span className="text-xs text-muted">@{u.username} · {u.publicId}</span>
              </td>
              <td className="px-2 py-1.5">
                <label htmlFor={`r-${u.id}`} className="sr-only">
                  Role for {u.username}
                </label>
                <select id={`r-${u.id}`} className="field h-8 py-0 text-xs" value={u.role} onChange={(e) => update(u.id, { role: e.target.value })}>
                  <option value="salesperson">Salesperson</option>
                  <option value="broker">Broker</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td className="px-2 py-1.5 text-xs">{u.disabled ? "Disabled" : u.mustChangePassword ? "Must change password" : "Active"}</td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap">
                <button type="button" className="btn btn-ghost min-h-8 px-2 text-xs" onClick={() => reset(u)}>
                  Reset password
                </button>{" "}
                <button type="button" className="btn btn-ghost min-h-8 px-2 text-xs" onClick={() => update(u.id, { disabled: !u.disabled })}>
                  {u.disabled ? "Enable" : "Disable"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Settings({ grid }: { grid: GridSDK }) {
  const isAdmin = grid.user?.role === "admin";
  const tabs = [
    ["account", "Account"],
    ["appearance", "Appearance"],
    ["usage", "My AI usage"],
    ...(isAdmin
      ? [
          ["users", "Users"],
          ["team-usage", "Team AI usage"],
        ]
      : []),
  ] as [string, string][];
  const start = typeof grid.launchArgs.tab === "string" && tabs.some(([k]) => k === grid.launchArgs.tab) ? (grid.launchArgs.tab as string) : "account";
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
        {tab === "account" && <Account grid={grid} />}
        {tab === "appearance" && <Appearance grid={grid} />}
        {tab === "usage" && <Usage grid={grid} all={false} />}
        {tab === "users" && <Users grid={grid} />}
        {tab === "team-usage" && <Usage grid={grid} all />}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return <AppFrame>{(grid) => <Settings grid={grid} />}</AppFrame>;
}
