/** Desktop icon layout saved in the desktop kv ("icons"). Shared by the server page and the client desktop. */
export const CELL = { w: 96, h: 108, pad: 12 };
export type IconMode = "grid" | "free";
export interface IconLayout {
  mode: IconMode;
  pos: Record<string, { x: number; y: number }>;
}
export const EMPTY_LAYOUT: IconLayout = { mode: "grid", pos: {} };

export function parseLayout(v: unknown): IconLayout {
  if (!v || typeof v !== "object") return EMPTY_LAYOUT;
  const o = v as Partial<IconLayout>;
  const pos: IconLayout["pos"] = {};
  for (const [k, p] of Object.entries(o.pos ?? {})) if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) pos[k] = { x: p.x, y: p.y };
  return { mode: o.mode === "free" ? "free" : "grid", pos };
}

