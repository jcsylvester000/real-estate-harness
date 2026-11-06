/**
 * Built-in apps. Each runs in its own iframe at `url` and talks to the desktop only through the
 * grid.js SDK, exactly like a third-party app (Puter's "apps are iframes" model).
 */
import type { Permission, Role } from "./permissions";

export interface AppInfo {
  id: string;
  name: string;
  description: string;
  /** Icon key, see components/desktop/icons.tsx */
  icon: string;
  url: string;
  kind: "builtin" | "external";
  permissions: Permission[];
  width: number;
  height: number;
  /** Shown only to these roles (undefined = everyone). */
  roles?: Role[];
  /** none: never uses AI · optional: better with an AI key, works without one · required: needs an AI key. */
  ai?: "none" | "optional" | "required";
  /** Opens a file of these extensions (".txt", ".md"). */
  opens?: string[];
  hidden?: boolean;
}

export const DESKTOP_APP_ID = "desktop";

export const BUILTIN_APPS: AppInfo[] = [
  {
    id: "deal-desk",
    name: "Deal Desk AI",
    description: "Ask about costs, loans, listings, buyer matches and your documents. Works with or without AI.",
    icon: "sparkles",
    url: "/apps/deal-desk",
    kind: "builtin",
    permissions: ["ai", "tools", "listings.read", "buyers", "docs", "fs.write", "teaser"],
    width: 980,
    height: 680,
    ai: "optional",
  },
  {
    id: "property-finder",
    name: "Property Finder",
    description: "Type what the client wants; get matching GRID listings. No AI needed.",
    icon: "search",
    url: "/apps/property-finder",
    kind: "builtin",
    permissions: ["listings.read", "buyers", "fs.write"],
    width: 1100,
    height: 700,
    ai: "none",
  },
  {
    id: "buyer-match",
    name: "Buyer Matching",
    description: "Score listings 1–10 against what a buyer needs. Save buyers; see matches both ways.",
    icon: "handshake",
    url: "/apps/buyer-match",
    kind: "builtin",
    permissions: ["listings.read", "buyers", "fs.write"],
    width: 1240,
    height: 780,
    ai: "none",
  },
  {
    id: "property-teaser",
    name: "Property Teaser",
    description: "Design presentations and teaser trailers for a property. Export to PowerPoint, PDF, Word or video.",
    icon: "presentation",
    url: "/apps/property-teaser",
    kind: "builtin",
    permissions: ["teaser", "listings.read", "fs.write", "ai"],
    width: 1280,
    height: 800,
    ai: "optional",
  },
  {
    id: "calculators",
    name: "Calculators",
    description: "Taxes, loans, commission, Maceda and foreign ownership. No AI, no cost.",
    icon: "calculator",
    url: "/apps/calculators",
    kind: "builtin",
    permissions: ["tools", "fs.write"],
    width: 860,
    height: 640,
  },
  {
    id: "listings",
    name: "Listings",
    description: "The GRID listings database: browse, edit and import CSV exports.",
    icon: "building",
    url: "/apps/listings",
    kind: "builtin",
    permissions: ["listings.read", "listings.write", "buyers"],
    width: 1180,
    height: 700,
  },
  {
    id: "files",
    name: "Files",
    description: "Your documents, notes and saved quotes.",
    icon: "folder",
    url: "/apps/files",
    kind: "builtin",
    permissions: ["fs.read", "fs.write"],
    width: 820,
    height: 560,
  },
  {
    id: "notes",
    name: "Notes",
    description: "Write and edit text and Markdown files.",
    icon: "notebook",
    url: "/apps/notes",
    kind: "builtin",
    permissions: ["fs.read", "fs.write"],
    width: 760,
    height: 560,
    opens: [".txt", ".md"],
  },
  {
    id: "app-center",
    name: "App Center",
    description: "Built-in and installed apps, permissions and the developer SDK.",
    icon: "grid",
    url: "/apps/app-center",
    kind: "builtin",
    permissions: ["system"],
    width: 900,
    height: 620,
    // Not on the desktop or start menu; opened from Settings > Apps.
    hidden: true,
  },
  {
    id: "settings",
    name: "Settings",
    description: "Account, appearance, AI usage and (admins) users.",
    icon: "settings",
    url: "/apps/settings",
    kind: "builtin",
    permissions: ["system", "usage.read", "ai"],
    width: 880,
    height: 620,
  },
];

/** The desktop itself, as an actor for its own calls (wallpaper, app list, file picker). */
export const DESKTOP_APP: AppInfo = {
  id: DESKTOP_APP_ID,
  name: "Desktop",
  description: "",
  icon: "grid",
  url: "/desktop",
  kind: "builtin",
  permissions: ["system", "fs.read"],
  width: 0,
  height: 0,
  hidden: true,
};

export const builtinApp = (id: string) => (id === DESKTOP_APP_ID ? DESKTOP_APP : BUILTIN_APPS.find((a) => a.id === id));

export const APP_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
