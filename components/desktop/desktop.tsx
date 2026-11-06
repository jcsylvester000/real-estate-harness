"use client";
/**
 * The Grid Agentic desktop: window manager + IPC gate.
 * Every app is an iframe running grid.js. Messages are matched to a window by event.source (never by
 * anything the app says about itself), checked against the permission model, and only then forwarded to
 * the server as that app. Third-party apps must be granted each permission by the user, once.
 */
import Image from "next/image";
import { Lock, Search } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AppInfo } from "@/lib/apps/catalog";
import { METHOD_PERMISSION, type Permission } from "@/lib/apps/permissions";
import { lockAction } from "@/app/(auth)/actions";
import { CallError, driverCall } from "./api";
import { DialogHost, Toasts, type DialogSpec, type OpenDialog, type Toast } from "./dialogs";
import { AppIcon, AppTile } from "./icons";
import { DesktopIcons, useIconLayout } from "./desktop-icons";
import type { IconLayout } from "@/lib/apps/icon-layout";
import { SpotlightTracker } from "@/components/apps/spotlight";
import { TASKBAR_H, WindowFrame, type Win } from "./window-frame";

import { WALLPAPERS } from "@/lib/apps/wallpapers";
const PROTOCOL = 1;
const DESKTOP_MENU: { label: string; appId: string; args?: Record<string, unknown> }[] = [
  { label: "Open Files", appId: "files" },
  { label: "Change wallpaper", appId: "settings", args: { tab: "appearance" } },
];

interface DesktopUser {
  displayName: string;
  username: string;
  role: string;
  publicId: string;
}

let uid = 0;
const nextId = (p: string) => `${p}${Date.now().toString(36)}${(uid++).toString(36)}`;

function buildSrc(app: AppInfo, winId: string) {
  // Built-in apps get the window id so they can be addressed; external URLs are used as given.
  if (app.kind === "builtin") return `${app.url}?win=${encodeURIComponent(winId)}`;
  return app.url;
}

export interface AiState {
  realAi: boolean;
  /** Names of providers with keys, e.g. ["Claude"]. */
  providers: string[];
}

export function Desktop({ user, initialApps, initialWallpaper, initialIcons, ai: initialAi }: { user: DesktopUser; initialApps: AppInfo[]; initialWallpaper: string; initialIcons: IconLayout; ai: AiState }) {
  // AI keys added or removed in an app update the taskbar badge right away.
  const [ai, setAi] = useState(initialAi);
  const refreshAi = useCallback(() => {
    driverCall("desktop", "ai.status", {})
      .then((st) => {
        const x = st as { realAi: boolean; providers: { id: string; label: string; configured: boolean }[] };
        setAi({ realAi: x.realAi, providers: x.providers.filter((p) => p.configured && p.id !== "demo").map((p) => p.label) });
      })
      .catch(() => {});
  }, []);
  const icons = useIconLayout(initialIcons);
  const [apps, setApps] = useState<AppInfo[]>(initialApps);
  const [wins, setWins] = useState<Win[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dialogs, setDialogs] = useState<OpenDialog[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [wallpaper, setWallpaper] = useState(initialWallpaper);
  const [compact, setCompact] = useState(false);
  const [clock, setClock] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const winsRef = useRef(wins);
  const appsRef = useRef(apps);
  useLayoutEffect(() => {
    winsRef.current = wins;
    appsRef.current = apps;
  }, [wins, apps]);
  const grants = useRef(new Map<string, Set<string>>());
  const zTop = useRef(10);

  // -- Layout helpers --
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const set = () => setCompact(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", weekday: "short", month: "short", day: "numeric" });
    const tick = () => setClock(fmt.format(new Date()));
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    driverCall<{ appId: string; permission: string }[]>("desktop", "apps.grants", {})
      .then((rows) => {
        for (const r of rows) {
          if (!grants.current.has(r.appId)) grants.current.set(r.appId, new Set());
          grants.current.get(r.appId)!.add(r.permission);
        }
      })
      .catch(() => {});
  }, []);

  const toast = useCallback((message: string, tone: Toast["tone"] = "info", source = "Grid Agentic") => {
    const id = nextId("t");
    setToasts((t) => [...t.slice(-3), { id, message: message.slice(0, 300), tone, source }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const ask = useCallback((spec: DialogSpec) => new Promise<unknown>((resolve) => setDialogs((d) => [...d, { id: nextId("d"), spec, resolve }])), []);
  const closeDialog = useCallback((id: string, value: unknown) => {
    setDialogs((d) => {
      d.find((x) => x.id === id)?.resolve(value);
      return d.filter((x) => x.id !== id);
    });
  }, []);

  // -- Window management --
  const focus = useCallback((id: string) => {
    setFocusedId(id);
    setWins((ws) => {
      const w = ws.find((x) => x.id === id);
      if (!w) return ws;
      if (w.z === zTop.current && !w.minimized) return ws;
      const z = ++zTop.current;
      return ws.map((x) => (x.id === id ? { ...x, z, minimized: false } : x));
    });
  }, []);

  const openApp = useCallback(
    (appId: string, launchArgs: Record<string, unknown> = {}) => {
      const app = appsRef.current.find((a) => a.id === appId);
      if (!app) {
        toast(`App "${appId}" is not installed.`, "warn");
        return null;
      }
      setStartOpen(false);
      const id = nextId("w");
      const vw = window.innerWidth;
      const vh = window.innerHeight - TASKBAR_H;
      const w = Math.min(app.width, vw - 24);
      const h = Math.min(app.height, vh - 24);
      const n = winsRef.current.length % 6;
      const z = ++zTop.current;
      const win: Win = {
        id,
        app,
        title: app.name,
        src: buildSrc(app, id),
        x: Math.max(12, Math.round((vw - w) / 2) + n * 28 - 70),
        y: Math.max(12, Math.round((vh - h) / 3) + n * 28),
        w,
        h,
        z,
        minimized: false,
        maximized: false,
        launchArgs,
      };
      setWins((ws) => [...ws, win]);
      setFocusedId(id);
      return id;
    },
    [toast],
  );

  const closeWin = useCallback((id: string) => {
    frames.current.delete(id);
    setWins((ws) => ws.filter((w) => w.id !== id));
    setFocusedId((f) => (f === id ? null : f));
  }, []);

  // Focus follows clicks into an iframe: the top document loses focus to that frame.
  useEffect(() => {
    const onBlur = () => {
      setTimeout(() => {
        const el = document.activeElement;
        if (el instanceof HTMLIFrameElement) {
          for (const [id, f] of frames.current) if (f === el) focus(id);
        }
      }, 0);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [focus]);

  const openFile = useCallback(
    (path: string) => {
      const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
      const handler = appsRef.current.find((a) => a.opens?.includes(ext));
      if (handler) return openApp(handler.id, { path });
      return openApp("files", { path: path.slice(0, path.lastIndexOf("/")) || "/" });
    },
    [openApp],
  );

  const refreshApps = useCallback(async () => {
    try {
      setApps(await driverCall<AppInfo[]>("desktop", "apps.list"));
    } catch {
      /* keep current list */
    }
  }, []);

  // -- IPC gate --
  const ensurePermission = useCallback(
    async (app: AppInfo, method: string) => {
      if (!(method in METHOD_PERMISSION)) throw new CallError("unknown_method", `Unknown method "${method}".`);
      const perm = METHOD_PERMISSION[method] as Permission | null;
      if (!perm) return;
      if (!app.permissions.includes(perm)) throw new CallError("permission_denied", `${app.name} did not declare the "${perm}" permission.`);
      if (app.kind === "builtin") return;
      if (perm === "system") throw new CallError("permission_denied", "Third-party apps cannot use system methods.");
      if (grants.current.get(app.id)?.has(perm)) return;
      const allowed = await ask({ kind: "permission", appName: app.name, appIcon: app.icon, appUrl: app.url, permission: perm });
      if (!allowed) throw new CallError("permission_denied", "The user did not allow this.");
      await driverCall("desktop", "apps.grant", { appId: app.id, permission: perm });
      if (!grants.current.has(app.id)) grants.current.set(app.id, new Set());
      grants.current.get(app.id)!.add(perm);
    },
    [ask],
  );

  const handleUi = useCallback(
    async (win: Win, method: string, p: Record<string, unknown>) => {
      const app = win.app;
      const s = (v: unknown, max = 2000) => String(v ?? "").slice(0, max);
      switch (method) {
        case "ui.alert":
          return ask({ kind: "alert", appName: app.name, title: s(p.title, 80), message: s(p.message) });
        case "ui.confirm":
          return ask({ kind: "confirm", appName: app.name, title: s(p.title, 80), message: s(p.message), okLabel: s(p.okLabel, 30), danger: !!p.danger });
        case "ui.prompt":
          return ask({ kind: "prompt", appName: app.name, title: s(p.title, 80), message: s(p.message, 300), defaultValue: s(p.defaultValue, 500) });
        case "ui.notify":
          toast(s(p.message, 300), (["info", "ok", "warn", "bad"].includes(String(p.tone)) ? p.tone : "info") as Toast["tone"], app.name);
          return true;
        case "ui.setTitle":
          setWins((ws) => ws.map((w) => (w.id === win.id ? { ...w, title: s(p.title, 80) || app.name } : w)));
          return true;
        case "ui.close":
          closeWin(win.id);
          return true;
        case "ui.openApp": {
          const args = app.kind === "builtin" && p.args && typeof p.args === "object" ? (p.args as Record<string, unknown>) : {};
          return !!openApp(s(p.appId, 40), args);
        }
        case "ui.openFile":
          await ensurePermission(app, "fs.read");
          return !!openFile(s(p.path, 600));
        case "ui.pickFile":
          await ensurePermission(app, "fs.read");
          return ask({ kind: "pickFile", appName: app.name, extensions: Array.isArray(p.extensions) ? p.extensions.slice(0, 10).map((x) => s(x, 10)) : [] });
        case "ui.setWallpaper":
          if (app.kind !== "builtin" || !app.permissions.includes("system")) throw new CallError("permission_denied", "Only system apps can change the wallpaper.");
          if (!(WALLPAPERS as readonly string[]).includes(s(p.wallpaper))) throw new CallError("invalid_input", "Unknown wallpaper.");
          setWallpaper(s(p.wallpaper));
          await driverCall("desktop", "kv.set", { key: "wallpaper", value: s(p.wallpaper) });
          return true;
        case "ui.refreshApps":
          await refreshApps();
          return true;
        default:
          throw new CallError("unknown_method", `Unknown method "${method}".`);
      }
    },
    [ask, closeWin, ensurePermission, openApp, openFile, refreshApps, toast],
  );

  useEffect(() => {
    const onMessage = async (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.__grid !== PROTOCOL || !ev.source) return;
      let win: Win | undefined;
      for (const [id, f] of frames.current) if (f.contentWindow === ev.source) win = winsRef.current.find((w) => w.id === id);
      if (!win) return;
      const target = ev.source as Window;
      // Sandboxed third-party frames have an opaque origin ("null"), so replies go to the exact window with "*".
      const reply = (msg: Record<string, unknown>) => target.postMessage({ __grid: PROTOCOL, ...msg }, win!.app.kind === "builtin" ? window.location.origin : "*");
      if (d.type === "hello") {
        reply({ type: "welcome", appId: win.app.id, appName: win.app.name, launchArgs: win.launchArgs, user: { displayName: user.displayName, role: user.role }, ai: { realAi: ai.realAi } });
        return;
      }
      if (d.type !== "req" || typeof d.id !== "string" || typeof d.method !== "string") return;
      const params = d.params && typeof d.params === "object" ? (d.params as Record<string, unknown>) : {};
      try {
        const result = d.method.startsWith("ui.") ? await handleUi(win, d.method, params) : await (async () => {
          await ensurePermission(win!.app, d.method);
          const out = await driverCall(win!.app.id, d.method, params);
          if (d.method === "ai.keys.save" || d.method === "ai.keys.remove") refreshAi();
          return out;
        })();
        reply({ type: "res", id: d.id, ok: true, result });
      } catch (err) {
        const e = err instanceof CallError ? err : new CallError("error", err instanceof Error ? err.message : String(err));
        reply({ type: "res", id: d.id, ok: false, error: { code: e.code, message: e.message } });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [ensurePermission, handleUi, user.displayName, user.role, ai.realAi, refreshAi]);

  // -- Keyboard: Escape closes menus --
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStartOpen(false);
        setMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visibleApps = useMemo(() => apps.filter((a) => !a.hidden), [apps]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? visibleApps.filter((a) => `${a.name} ${a.description}`.toLowerCase().includes(q)) : visibleApps;
  }, [query, visibleApps]);
  const topWin = wins.filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0];
  const activeId = focusedId && wins.some((w) => w.id === focusedId && !w.minimized) ? focusedId : topWin?.id;

  return (
    <div
      className={`${wallpaper} relative h-dvh w-full overflow-clip`}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("[data-desktop-surface]")) {
          e.preventDefault();
          setMenu({ x: Math.min(e.clientX, window.innerWidth - 232), y: Math.min(e.clientY, window.innerHeight - 260) });
        }
      }}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest("[data-menu]")) setMenu(null);
        if (!(e.target as HTMLElement).closest("[data-start]")) setStartOpen(false);
      }}
    >
      <div className="ga-aurora" aria-hidden />
      <SpotlightTracker />
      <main data-desktop-surface aria-label="Desktop" className="absolute inset-0" style={{ bottom: TASKBAR_H }}>
        <h1 className="sr-only">Grid Agentic desktop</h1>
        {compact ? (
          <ul className="grid w-max grid-flow-col grid-rows-[repeat(auto-fill,104px)] gap-1 p-3" style={{ maxHeight: `calc(100% - 8px)` }}>
            {visibleApps.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  data-desktop-icon={a.id}
                  onClick={() => openApp(a.id)}
                  className="flex w-[88px] flex-col items-center gap-1.5 rounded-lg p-2 text-center text-[12px] leading-tight text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.7)] hover:bg-white/10 focus-visible:bg-white/15"
                  title={a.description}
                >
                  <AppTile icon={a.icon} />
                  <span className="line-clamp-2">{a.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <DesktopIcons apps={visibleApps} layout={icons.layout} update={icons.update} onOpen={(id) => openApp(id)} />
        )}
        {wins.length === 0 && (
          <div className="pointer-events-none absolute right-6 bottom-6 hidden max-w-xs text-right text-cream/80 md:block">
            <p className="font-display text-2xl text-cream">Magandang araw, {user.displayName.split(" ")[0]}.</p>
            <p className="mt-1 text-sm">
              {ai.realAi
                ? "Double-click an app to open it. Deal Desk AI answers with GRID's own calculators and listings."
                : "Double-click an app to open it. Property Finder, Listings, Calculators and Files all work without an AI key."}
            </p>
          </div>
        )}
      </main>

      {wins.map((w) => (
        <WindowFrame
          key={w.id}
          win={w}
          compact={compact}
          focused={w.id === activeId}
          onFocus={() => focus(w.id)}
          onClose={() => closeWin(w.id)}
          onMinimize={() => setWins((ws) => ws.map((x) => (x.id === w.id ? { ...x, minimized: true } : x)))}
          onToggleMax={() => setWins((ws) => ws.map((x) => (x.id === w.id ? { ...x, maximized: !x.maximized } : x)))}
          onMove={(patch) => setWins((ws) => ws.map((x) => (x.id === w.id ? { ...x, ...patch } : x)))}
          registerFrame={(el) => {
            if (el) frames.current.set(w.id, el);
          }}
        />
      ))}

      {menu && (
        <div data-menu role="menu" className="card ga-pop fixed z-[7000] w-56 py-1 text-sm" style={{ left: menu.x, top: menu.y }}>
          <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold tracking-wider text-muted uppercase">Icons</p>
          {(
            [
              ["grid", "Snap icons to grid"],
              ["free", "Free icon placement"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              role="menuitemradio"
              aria-checked={icons.layout.mode === mode}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-sand"
              onClick={() => {
                setMenu(null);
                icons.setMode(mode);
              }}
            >
              <span className={`size-1.5 rounded-full ${icons.layout.mode === mode ? "bg-bronze" : "bg-transparent"}`} aria-hidden />
              {label}
            </button>
          ))}
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-sand"
            onClick={() => {
              setMenu(null);
              icons.tidy();
            }}
          >
            <span className="size-1.5" aria-hidden />
            Tidy up icons
          </button>
          <hr className="my-1 border-line" />
          {DESKTOP_MENU.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-sand"
              onClick={() => {
                setMenu(null);
                openApp(it.appId, it.args);
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}

      {startOpen && (
        <div data-start className="card ga-pop fixed bottom-[60px] left-2 z-[7000] flex max-h-[min(560px,calc(100dvh-80px))] w-[min(380px,calc(100vw-16px))] flex-col overflow-hidden">
          <div className="border-b border-line p-3">
            <label htmlFor="start-search" className="sr-only">
              Search apps
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-line-2 bg-white px-2">
              <Search size={15} className="text-muted" aria-hidden />
              <input
                id="start-search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && filtered[0] && openApp(filtered[0].id)}
                placeholder="Search apps"
                className="w-full bg-transparent py-2 text-sm focus:outline-none"
              />
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-auto p-2">
            {filtered.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => openApp(a.id)} className="spotlight group relative flex w-full items-center gap-3 overflow-hidden rounded-xl p-2 text-left transition-colors hover:bg-sand">
                  <AppTile icon={a.icon} size={36} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{a.name}</span>
                    <span className="block truncate text-xs text-muted">{a.description}</span>
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="p-3 text-sm text-muted">No app matches.</li>}
          </ul>
          <div className="flex items-center justify-between border-t border-line bg-sand px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.displayName}</p>
              <p className="text-xs text-muted capitalize">
                Unlocked with the team PIN
              </p>
            </div>
            <form action={lockAction}>
              <button type="submit" className="btn btn-ghost min-h-9 px-3">
                <Lock size={15} aria-hidden /> Lock
              </button>
            </form>
          </div>
        </div>
      )}

      <nav aria-label="Taskbar" className="fixed inset-x-0 bottom-0 z-[6000] flex items-center gap-1 border-t border-white/10 bg-navy/85 px-2 text-cream backdrop-blur-md" style={{ height: TASKBAR_H }}>
        <button
          type="button"
          data-start
          aria-label="Start"
          aria-expanded={startOpen}
          onClick={() => {
            setQuery("");
            setStartOpen((o) => !o);
          }}
          className={`flex h-10 items-center gap-2 rounded-lg px-2 hover:bg-white/10 ${startOpen ? "bg-white/15" : ""}`}
        >
          <Image src="/icon.svg" alt="" width={26} height={26} />
          <span className="hidden font-display text-[15px] sm:inline">Grid</span>
        </button>
        <span className="mx-1 h-6 w-px bg-white/15" aria-hidden />
        <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {wins.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                aria-pressed={w.id === activeId}
                onClick={() => {
                  if (w.id === activeId) setWins((ws) => ws.map((x) => (x.id === w.id ? { ...x, minimized: true } : x)));
                  else focus(w.id);
                }}
                className={`relative flex h-10 max-w-48 items-center gap-2 rounded-lg px-2.5 text-[13px] transition-all duration-200 hover:-translate-y-px hover:bg-white/10 ${w.id === activeId ? "bg-white/15" : ""} ${w.minimized ? "opacity-60" : ""}`}
                title={w.title}
              >
                <AppIcon icon={w.app.icon} size={16} className="text-gold" />
                <span className="hidden truncate sm:inline">{w.title}</span>
                {w.id === activeId && <span className="ga-limelight absolute right-3 bottom-0.5 left-3 h-[2px] rounded-full bg-gold" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          data-ai-status={ai.realAi ? "ready" : "off"}
          onClick={() => openApp("settings", { tab: "ai" })}
          title={ai.realAi ? `No AI by default. AI keys ready: ${ai.providers.join(", ")} (pick one in Deal Desk).` : "No AI by default. Add your own AI key in Settings → AI setup. Click for details."}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-2.5 text-[11px] hover:bg-white/10"
        >
          <span className={`size-2 rounded-full ${ai.realAi ? "bg-[#4ade80]" : "bg-gold"}`} aria-hidden />
          <span className="hidden md:inline">{ai.realAi ? `AI ready · ${ai.providers.length} key${ai.providers.length === 1 ? "" : "s"}` : "Query Engine (no AI)"}</span>
          <span className="sr-only md:hidden">{ai.realAi ? "AI connected" : "No AI key: Query Engine mode"}</span>
        </button>
        <time className="hidden px-2 text-right text-xs text-mist sm:block" aria-label="Manila time">
          {clock}
        </time>
      </nav>

      <DialogHost dialog={dialogs[0]} close={closeDialog} />
      <Toasts toasts={toasts} dismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
