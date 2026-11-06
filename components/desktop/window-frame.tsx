"use client";
import { Copy, Minus, Square, X } from "lucide-react";
import { useRef } from "react";
import type { AppInfo } from "@/lib/apps/catalog";
import { AppIcon } from "./icons";

export interface Win {
  id: string;
  app: AppInfo;
  title: string;
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  launchArgs: Record<string, unknown>;
}

const MIN_W = 320;
const MIN_H = 220;
export const TASKBAR_H = 52;

/** Built-in apps share the site origin; third-party apps get an opaque origin (no allow-same-origin). */
const SANDBOX = {
  builtin: "allow-scripts allow-forms allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox",
  external: "allow-scripts allow-forms allow-downloads allow-popups",
};

export function WindowFrame({
  win,
  focused,
  compact,
  onFocus,
  onClose,
  onMinimize,
  onToggleMax,
  onMove,
  registerFrame,
}: {
  win: Win;
  focused: boolean;
  compact: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMax: () => void;
  onMove: (patch: Partial<Pick<Win, "x" | "y" | "w" | "h">>) => void;
  registerFrame: (el: HTMLIFrameElement | null) => void;
}) {
  const drag = useRef<{ mode: "move" | "resize"; sx: number; sy: number; x: number; y: number; w: number; h: number } | null>(null);
  const max = win.maximized || compact;

  const start = (mode: "move" | "resize", e: React.PointerEvent) => {
    if (max || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    onFocus();
    drag.current = { mode, sx: e.clientX, sy: e.clientY, x: win.x, y: win.y, w: win.w, h: win.h };
    document.documentElement.classList.add("ga-dragging");
    const moveFn = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.sx;
      const dy = ev.clientY - d.sy;
      const vw = window.innerWidth;
      const vh = window.innerHeight - TASKBAR_H;
      if (d.mode === "move") onMove({ x: Math.min(Math.max(d.x + dx, -d.w + 120), vw - 120), y: Math.min(Math.max(d.y + dy, 0), vh - 40) });
      else onMove({ w: Math.max(MIN_W, Math.min(d.w + dx, vw - d.x)), h: Math.max(MIN_H, Math.min(d.h + dy, vh - d.y)) });
    };
    const up = () => {
      drag.current = null;
      document.documentElement.classList.remove("ga-dragging");
      window.removeEventListener("pointermove", moveFn);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", moveFn);
    window.addEventListener("pointerup", up);
  };

  const onKeyTitle = (e: React.KeyboardEvent) => {
    if (max) return;
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, Partial<Win>> = {
      ArrowLeft: { x: win.x - step },
      ArrowRight: { x: win.x + step },
      ArrowUp: { y: Math.max(0, win.y - step) },
      ArrowDown: { y: win.y + step },
    };
    if (moves[e.key]) {
      e.preventDefault();
      onMove(moves[e.key]!);
    }
  };

  const style: React.CSSProperties = max
    ? { left: 0, top: 0, width: "100%", height: `calc(100% - ${TASKBAR_H}px)`, zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  return (
    <section
      role="dialog"
      aria-label={win.title}
      data-window={win.app.id}
      className={`ga-win-in absolute flex flex-col overflow-hidden bg-cream transition-shadow duration-300 ${max ? "" : "rounded-xl"} ${
        focused ? "shadow-[0_30px_70px_-14px_rgb(0_0_0/0.65),0_0_0_1px_rgb(226_185_133/0.18)] ring-1 ring-black/20" : "shadow-[0_12px_30px_-12px_rgb(0_0_0/0.45)] ring-1 ring-black/10 saturate-[.92]"
      } ${win.minimized ? "hidden" : ""}`}
      style={style}
      onPointerDownCapture={onFocus}
    >
      <header
        className={`flex h-10 shrink-0 select-none items-center gap-2 border-b px-3 ${focused ? "border-navy-2 bg-navy text-cream" : "border-line bg-sand text-ink-2"} ${max ? "" : "cursor-grab active:cursor-grabbing"}`}
        onPointerDown={(e) => start("move", e)}
        onDoubleClick={(e) => !(e.target as HTMLElement).closest("button") && !compact && onToggleMax()}
        tabIndex={0}
        onKeyDown={onKeyTitle}
        aria-label={`${win.title} title bar. Use arrow keys to move.`}
      >
        <AppIcon icon={win.app.icon} size={16} className={focused ? "text-gold" : ""} />
        <h2 className="min-w-0 flex-1 truncate font-sans text-[13px] font-medium">{win.title}</h2>
        {win.app.kind === "external" && <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">3rd party</span>}
        <div className="flex items-center gap-0.5">
          <button type="button" aria-label="Minimize" className="grid size-7 place-items-center rounded hover:bg-white/15" onClick={onMinimize}>
            <Minus size={14} />
          </button>
          {!compact && (
            <button type="button" aria-label={win.maximized ? "Restore" : "Maximize"} className="grid size-7 place-items-center rounded hover:bg-white/15" onClick={onToggleMax}>
              {win.maximized ? <Copy size={13} /> : <Square size={12} />}
            </button>
          )}
          <button type="button" aria-label="Close" className="grid size-7 place-items-center rounded hover:bg-bad hover:text-white" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </header>
      <iframe
        ref={registerFrame}
        title={win.title}
        src={win.src}
        sandbox={SANDBOX[win.app.kind]}
        allow="clipboard-write"
        referrerPolicy="no-referrer"
        className="min-h-0 w-full flex-1 border-0 bg-cream"
      />
      {!max && (
        <div className="absolute right-0 bottom-0 size-4 cursor-nwse-resize" onPointerDown={(e) => start("resize", e)} aria-hidden>
          <svg viewBox="0 0 16 16" className="size-4 text-muted/60">
            <path d="M15 6 6 15M15 11l-4 4" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </div>
      )}
    </section>
  );
}
