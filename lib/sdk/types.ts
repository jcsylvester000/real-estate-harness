/** Types for public/sdk/grid.js (the window.grid object inside app iframes). */
import type { AppInfo } from "@/lib/apps/catalog";
import type { ToolDefinition, HarnessTurnResult } from "@/lib/harness/harness/types";
import type { IndexFacets, ListingCard, SearchInput, SearchResult } from "@/lib/listings/search";
import type { ImportSummary } from "@/lib/listings/import";
import type { ParsedInquiry } from "@/lib/listings/inquiry";
import type { Lender } from "@/lib/lenders/data";
import type { DocInput, DocSummary, Passage } from "@/lib/server/services/documents";
import type { LenderQuote, MortgageInput } from "@/lib/lenders/mortgage";
import type { BuyerCriteria, MatchPart, MatchScore } from "@/lib/listings/match";
import type { BuyerSummary, MatchedListing, MatchResult } from "@/lib/listings/buyers";

export interface FsEntry {
  path: string;
  name: string;
  isDir: boolean;
  mime: string;
  size: number;
  updatedAt: string;
}
export type { Lender, LenderQuote, MortgageInput, DocInput, DocSummary, Passage };
export type { ListingCard, SearchInput, SearchResult, IndexFacets, ImportSummary, ParsedInquiry, BuyerCriteria, MatchPart, MatchScore, BuyerSummary, MatchedListing, MatchResult };
export type ListingDetail = ListingCard & { notes: string; bathrooms: number | null; foreignEligible: boolean | null; titleType: string; propertySubType: string; exclusive: boolean; publishedAt: string | null; listedByEmail?: string; analysis: { region: string | null; locationTier: string; areaSqm: number | null; pricePerSqm: number | null; features: string[]; purposes: Record<string, number>; quality: number; missing: string[]; summary: string } };
export interface ImportBatch { id: number; fileName: string; rowsTotal: number; inserted: number; updated: number; skipped: number; createdAt: string; problems: { row: number; code: string; reason: string }[] }
export interface ProviderInfo {
  id: string;
  label: string;
  configured: boolean;
  models: { balanced: string; budget: string };
  isDefault: boolean;
  source?: "engine" | "mine" | "team";
}
export interface TeaserSummary {
  id: string;
  kind: string;
  title: string;
  templateId: string;
  thumb: string;
  updatedAt: string;
}
export interface TeaserAsset {
  id: string;
  src: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  source: string;
  name: string;
  credit: string;
  createdAt: string;
}
import type { WebImage } from "@/lib/server/services/teasers";
export type { WebImage };
export interface SavedAiKey {
  provider: string;
  label: string;
  keyHint: string;
  model: string;
  budgetModel: string;
  baseUrl: string;
  updatedAt: string;
}
export interface AiKeyForm {
  provider: string;
  apiKey?: string;
  model?: string;
  budgetModel?: string;
  baseUrl?: string;
}
export type ChatTurn = HarnessTurnResult & { spentTodayPhp: number; dailyCapPhp: number; /** Query Engine only. */ intent?: string | null; suggestions?: string[] };

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
    available: boolean;
    status(): Promise<{ realAi: boolean; demo: boolean; providers: { id: string; label: string; configured: boolean }[] }>;
    chat(message: string, opts?: { sessionId?: string; provider?: string; tier?: "balanced" | "budget" }): Promise<ChatTurn>;
    providers(): Promise<ProviderInfo[]>;
    sessions(): Promise<{ id: string; title: string; updatedAt: string }[]>;
    session(id: string): Promise<{ id: string; messages: { role: "user" | "assistant"; content: string }[] }>;
    deleteSession(id: string): Promise<boolean>;
    keys: {
      list(): Promise<SavedAiKey[]>;
      save(k: AiKeyForm): Promise<SavedAiKey>;
      test(k: AiKeyForm): Promise<{ ok: boolean; model: string; ms: number; reply?: string; error?: string }>;
      remove(provider: string): Promise<boolean>;
    };
  };
  tools: { list(): Promise<ToolDefinition[]>; run<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> };
  listings: {
    search(f?: SearchInput): Promise<SearchResult>;
    ask(text: string, opts?: { limit?: number; offset?: number; sort?: SearchInput["sort"] }): Promise<{ parsed: ParsedInquiry; result: SearchResult }>;
    facets(): Promise<IndexFacets>;
    get(code: string): Promise<ListingDetail | null>;
    save(l: Record<string, unknown>): Promise<ListingDetail>;
    delete(code: string): Promise<boolean>;
    import(fileName: string, csv: string): Promise<ImportSummary>;
    imports(): Promise<ImportBatch[]>;
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
  teaser: {
    list(): Promise<TeaserSummary[]>;
    get(id: string): Promise<{ id: string; kind: string; title: string; templateId: string; data: Record<string, unknown>; updatedAt: string }>;
    save(p: { id?: string; kind: "deck" | "trailer"; title: string; templateId: string; data: Record<string, unknown>; thumb?: string }): Promise<{ id: string; updatedAt: string }>;
    delete(id: string): Promise<boolean>;
    duplicate(id: string): Promise<{ id: string; updatedAt: string }>;
    assets(source?: "upload" | "logo" | "web"): Promise<TeaserAsset[]>;
    addAsset(a: { dataUrl: string; width?: number; height?: number; source?: "upload" | "logo"; name?: string }): Promise<TeaserAsset>;
    deleteAsset(id: string): Promise<boolean>;
    searchWeb(q: string, page?: number): Promise<{ results: WebImage[]; total: number }>;
    importUrl(i: { url: string; credit?: string; name?: string }): Promise<TeaserAsset>;
    polish(i: { text: string; details?: Record<string, unknown> }): Promise<{ taglines: string[]; short: string; long: string; highlights: string[]; provider: string; model: string }>;
  };
  docs: {
    list(): Promise<DocSummary[]>;
    notes(): Promise<{ path: string; name: string; updatedAt: string; preview: string }[]>;
    get(id: string, opts?: { withText?: boolean }): Promise<DocSummary & { text?: string }>;
    search(q: string, opts?: { limit?: number }): Promise<Passage[]>;
    add(input: DocInput): Promise<DocSummary>;
    delete(id: string): Promise<boolean>;
  };
  lenders: {
    list(): Promise<(Lender & { edited: boolean })[]>;
    compare(input: MortgageInput & { lenderIds?: string[] }): Promise<{ quotes: LenderQuote[]; best: { lender: string; monthlyPayment: number | null; ratePct: number | null; rateLabel: string } | null; disclaimer: string }>;
    save(l: Omit<Lender, "basis" | "verify" | "promo" | "ltvTiers">): Promise<Lender>;
    reset(id: string): Promise<boolean>;
  };
  match: {
    run(criteria: BuyerCriteria, opts?: { limit?: number; offset?: number }): Promise<MatchResult>;
    buyers(): Promise<BuyerSummary[]>;
    saveBuyer(input: { id?: string; label: string; notes?: string; criteria: BuyerCriteria }): Promise<string>;
    deleteBuyer(id: string): Promise<boolean>;
    buyerMatches(id: string, opts?: { limit?: number; offset?: number }): Promise<{ profile: { id: string; label: string; notes: string; criteria: BuyerCriteria; description: string }; total: number; results: MatchedListing[] }>;
    listingBuyers(code: string): Promise<{ id: string; label: string; description: string; score: number; rating: number; parts: MatchPart[] }[]>;
  };
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
