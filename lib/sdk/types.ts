/** Types for public/sdk/grid.js (the window.grid object inside app iframes). */
import type { AppInfo } from "@/lib/apps/catalog";
import type { ToolDefinition, HarnessTurnResult } from "@/lib/harness/harness/types";
import type { Listing } from "@/lib/harness/tools/search-listings";

export interface FsEntry {
  path: string;
  name: string;
  isDir: boolean;
  mime: string;
  size: number;
  updatedAt: string;
}
export type ListingRow = Listing & { isDemo: boolean; updatedAt: string };
export interface ProviderInfo {
  id: string;
  label: string;
  configured: boolean;
  models: { balanced: string; budget: string };
  isDefault: boolean;
}
export type ChatTurn = HarnessTurnResult & { spentTodayPhp: number; dailyCapPhp: number };

export interface GridSDK {
  ready: Promise<GridSDK>;
  appId: string | null;
  appName?: string;
  launchArgs: Record<string, unknown>;
  user: { displayName: string; role: string } | null;
  call<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
  on(name: string, fn: (data: unknown) => void): () => void;
  auth: { whoami(): Promise<{ id: string; username: string; displayName: string; role: string; publicId: string }> };
  ai: {
    chat(message: string, opts?: { sessionId?: string; provider?: string; tier?: "balanced" | "budget" }): Promise<ChatTurn>;
    providers(): Promise<ProviderInfo[]>;
    sessions(): Promise<{ id: string; title: string; updatedAt: string }[]>;
    session(id: string): Promise<{ id: string; messages: { role: "user" | "assistant"; content: string }[] }>;
    deleteSession(id: string): Promise<boolean>;
  };
  tools: { list(): Promise<ToolDefinition[]>; run<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> };
  listings: {
    search(f?: Record<string, unknown>): Promise<ListingRow[]>;
    get(id: string): Promise<ListingRow | null>;
    save(l: Record<string, unknown>): Promise<ListingRow>;
    delete(id: string): Promise<boolean>;
  };
  fs: {
    list(path?: string): Promise<FsEntry[]>;
    stat(path: string): Promise<FsEntry>;
    read(path: string): Promise<FsEntry & { encoding: "utf8" | "base64"; content: string }>;
    write(path: string, content: string, opts?: { encoding?: "utf8" | "base64"; mime?: string; overwrite?: boolean; createParents?: boolean }): Promise<FsEntry>;
    mkdir(path: string, opts?: { createParents?: boolean }): Promise<FsEntry>;
    rename(from: string, to: string): Promise<FsEntry>;
    delete(path: string): Promise<{ deleted: number }>;
  };
  kv: { get<T = unknown>(key: string): Promise<T | null>; set(key: string, value: unknown): Promise<boolean>; del(key: string): Promise<boolean>; list(prefix?: string): Promise<string[]> };
  usage: { mine(): Promise<UsageMine>; all(): Promise<UsageAllRow[]> };
  apps: {
    list(): Promise<AppInfo[]>;
    install(input: Record<string, unknown>): Promise<AppInfo>;
    uninstall(appId: string): Promise<boolean>;
    grants(p?: { appId?: string }): Promise<{ appId: string; permission: string; createdAt: string }[]>;
    revoke(appId: string, permission?: string): Promise<boolean>;
  };
  users: {
    list(): Promise<UserRow[]>;
    create(input: { username: string; displayName?: string; password: string; role: string }): Promise<UserRow>;
    update(input: { userId: string; role?: string; disabled?: boolean; displayName?: string }): Promise<UserRow>;
    resetPassword(input: { userId: string; temporaryPassword: string }): Promise<boolean>;
  };
  account: { update(input: { displayName: string }): Promise<boolean>; changePassword(input: { current: string; next: string }): Promise<boolean> };
  ui: {
    alert(message: string, opts?: { title?: string }): Promise<unknown>;
    confirm(message: string, opts?: { title?: string; okLabel?: string; danger?: boolean }): Promise<boolean>;
    prompt(message: string, defaultValue?: string, opts?: { title?: string }): Promise<string | null>;
    notify(message: string, opts?: { tone?: "info" | "ok" | "warn" | "bad" }): Promise<boolean>;
    setTitle(title: string): Promise<boolean>;
    openApp(appId: string, args?: Record<string, unknown>): Promise<boolean>;
    openFile(path: string): Promise<boolean>;
    pickFile(opts?: { extensions?: string[] }): Promise<{ path: string; name: string } | null>;
    close(): Promise<boolean>;
  };
}

export interface UsageMine {
  dailyCapPhp: number;
  today: { turns: number; php: number };
  last30Days: { provider: string; model: string; turns: number; php: number }[];
  recent: { createdAt: string; appId: string; model: string; tools: string[]; inputTokens: number; outputTokens: number; php: number }[];
}
export interface UsageAllRow {
  username: string;
  displayName: string;
  turns: number;
  php: number;
  today: number;
}
export interface UserRow {
  id: string;
  publicId: string;
  username: string;
  displayName: string;
  role: string;
  disabled?: boolean;
  mustChangePassword: boolean;
  createdAt?: string;
}

declare global {
  interface Window {
    grid?: GridSDK;
  }
}
