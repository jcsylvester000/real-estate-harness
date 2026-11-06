import {
  AppWindow,
  Building2,
  Calculator,
  Folder,
  LayoutGrid,
  NotebookPen,
  Puzzle,
  Search,
  Handshake,
  Presentation,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  calculator: Calculator,
  building: Building2,
  folder: Folder,
  notebook: NotebookPen,
  grid: LayoutGrid,
  settings: Settings,
  puzzle: Puzzle,
  search: Search,
  handshake: Handshake,
  presentation: Presentation,
  app: AppWindow,
};

/** Tile colours per icon key; third-party apps get the neutral tile. */
const TILES: Record<string, string> = {
  sparkles: "bg-bronze text-navy",
  calculator: "bg-gold text-navy",
  building: "bg-panel text-cream",
  folder: "bg-[#d9a066] text-navy",
  notebook: "bg-cream text-navy",
  grid: "bg-navy-2 text-gold",
  settings: "bg-mist text-navy",
  search: "bg-ok text-white",
  handshake: "bg-[#7c3a5b] text-white",
  presentation: "bg-gradient-to-br from-[#f28c28] to-[#be4b2a] text-white",
};

export const ICON_KEYS = Object.keys(ICONS);

export function AppIcon({ icon, size = 22, className = "" }: { icon: string; size?: number; className?: string }) {
  const Icon = ICONS[icon] ?? Puzzle;
  return <Icon size={size} aria-hidden className={className} />;
}

export function AppTile({ icon, size = 48 }: { icon: string; size?: number }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl shadow-[0_6px_16px_-6px_rgb(0_0_0/0.5)] ring-1 ring-white/10 ${TILES[icon] ?? "bg-sand text-navy"}`}
      style={{ width: size, height: size }}
    >
      <AppIcon icon={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}
