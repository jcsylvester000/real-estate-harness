"use client";
/**
 * Desktop icons you can drag. Two modes (right-click the desktop to switch):
 *  - grid: icons snap to cells; dropping on a taken cell swaps the two icons.
 *  - free: icons stay exactly where they are dropped.
 * Positions are saved per user in the desktop's kv ("icons").
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppInfo } from "@/lib/apps/catalog";
import { driverCall } from "./api";
import { AppTile } from "./icons";

import { CELL, type IconLayout, type IconMode } from "@/lib/apps/icon-layout";

const cellXY = (c: number, r: number) => ({ x: CELL.pad + c * CELL.w, y: CELL.pad + r * CELL.h });
const snap = (x: number, y: number, rows: number, cols: number) => {
  const c = Math.max(0, Math.min(cols - 1, Math.round((x - CELL.pad) / CELL.w)));
  const r = Math.max(0, Math.min(rows - 1, Math.round((y - CELL.pad) / CELL.h)));
  return cellXY(c, r);
};

export function useIconLayout(initial: IconLayout) {
  const [layout, setLayout] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((l: IconLayout) => {
    if (timer.current) clearTimeout(timer.current);
    // Saved right away: a drop is a single event, and the page may be reloaded at once.
    timer.current = setTimeout(() => driverCall("desktop", "kv.set", { key: "icons", value: l }).catch(() => {}), 0);
  }, []);
  const update = useCallback(
    (fn: (l: IconLayout) => IconLayout) =>
      setLayout((l) => {
        const next = fn(l);
        persist(next);
        return next;
      }),
    [persist],
  );
  return {
    layout,
    update,
    setMode: (mode: IconMode) => update((l) => ({ ...l, mode, pos: mode === "grid" ? {} : l.pos })),
    tidy: () => update((l) => ({ ...l, pos: {} })),
  };
}

export function DesktopIcons({ apps, layout, update, onOpen }: { apps: AppInfo[]; layout: IconLayout; update: (fn: (l: IconLayout) => IconLayout) => void; onOpen: (id: string) => void }) {
  const surface = useRef<HTMLUListElement>(null);
  // Real size arrives from the ResizeObserver right after mount; icons stay hidden until then (no jump).
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; dx: number; dy: number; moved: boolean; startX: number; startY: number } | null>(null);
  const justDragged = useRef(false);

  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const box = size ?? { w: 1200, h: 700 };
  const rows = Math.max(1, Math.floor((box.h - CELL.pad * 2) / CELL.h));
  const cols = Math.max(1, Math.floor((box.w - CELL.pad * 2) / CELL.w));

  // Resolve every icon's position: saved (clamped / snapped), else the next free cell, column by column.
  const positions: Record<string, { x: number; y: number }> = {};
  const taken = new Set<string>();
  const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
  for (const a of apps) {
    const p = layout.pos[a.id];
    if (!p) continue;
    const q = layout.mode === "grid" ? snap(p.x, p.y, rows, cols) : { x: Math.max(0, Math.min(box.w - CELL.w, p.x)), y: Math.max(0, Math.min(box.h - CELL.h, p.y)) };
    if (layout.mode === "grid" && taken.has(key(q))) continue;
    positions[a.id] = q;
    taken.add(key(q));
  }
  let slot = 0;
  for (const a of apps) {
    if (positions[a.id]) continue;
    let q = cellXY(Math.floor(slot / rows), slot % rows);
    while (taken.has(key(q))) {
      slot++;
      q = cellXY(Math.floor(slot / rows), slot % rows);
    }
    positions[a.id] = q;
    taken.add(key(q));
    slot++;
  }

  const target = drag?.moved && layout.mode === "grid" ? snap(drag.x, drag.y, rows, cols) : null;

  const onDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    const p = positions[id]!;
    setDrag({ id, x: p.x, y: p.y, dx: e.clientX - p.x, dy: e.clientY - p.y, moved: false, startX: e.clientX, startY: e.clientY });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5;
    if (moved && !drag.moved) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ ...drag, moved, x: e.clientX - drag.dx, y: e.clientY - drag.dy });
  };
  const onUp = () => {
    if (!drag) return;
    if (drag.moved) {
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
      const id = drag.id;
      if (layout.mode === "grid") {
        const to = snap(drag.x, drag.y, rows, cols);
        const from = positions[id]!;
        const other = apps.find((a) => a.id !== id && positions[a.id]?.x === to.x && positions[a.id]?.y === to.y);
        update((l) => ({ ...l, pos: { ...positionsAll(), [id]: to, ...(other ? { [other.id]: from } : {}) } }));
      } else {
        const to = { x: Math.max(0, Math.min(box.w - CELL.w, drag.x)), y: Math.max(0, Math.min(box.h - CELL.h, drag.y)) };
        update((l) => ({ ...l, pos: { ...positionsAll(), [id]: to } }));
      }
    }
    setDrag(null);
  };
  // Freeze every icon's current spot when one moves, so auto-placed icons don't shuffle.
  const positionsAll = () => Object.fromEntries(apps.map((a) => [a.id, positions[a.id]!]));

  return (
    <ul ref={surface} className={`absolute inset-0 ${size ? "" : "invisible"}`} data-icon-mode={layout.mode} aria-label="Apps on the desktop">
      {target && <li aria-hidden className="ga-snap-ghost" style={{ left: target.x, top: target.y, width: CELL.w - 8, height: CELL.h - 8 }} />}
      {apps.map((a, i) => {
        const dragging = drag?.id === a.id && drag.moved;
        const p = dragging ? { x: drag.x, y: drag.y } : positions[a.id]!;
        return (
          <li key={a.id} className={`ga-icon absolute ${dragging ? "ga-icon-dragging" : ""}`} style={{ left: p.x, top: p.y, animationDelay: `${i * 35}ms` }}>
            <button
              type="button"
              data-desktop-icon={a.id}
              onPointerDown={(e) => onDown(e, a.id)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => setDrag(null)}
              onDoubleClick={() => !justDragged.current && onOpen(a.id)}
              onClick={(e) => e.detail === 0 && onOpen(a.id)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(a.id)}
              className="ga-rise flex w-[88px] touch-none flex-col items-center gap-1.5 rounded-xl p-2 text-center text-[12px] leading-tight text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.7)] select-none hover:bg-white/10 focus-visible:bg-white/15"
              title={`${a.description}\nDrag to move. ${layout.mode === "grid" ? "Snaps to the grid." : "Free placement."}`}
            >
              <span className="ga-tile">
                <AppTile icon={a.icon} />
              </span>
              <span className="line-clamp-2">{a.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
