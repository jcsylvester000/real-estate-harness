/**
 * Grid Agentic database schema (PostgreSQL; Neon in production, PGlite for local tests).
 * Money: pesos as NUMERIC(14,2), US$ AI cost as NUMERIC(12,6). Times are timestamptz (UTC).
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: text("public_id").notNull().unique(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** admin | broker | salesperson */
    role: text("role").notNull().default("salesperson"),
    disabled: boolean("disabled").notNull().default(false),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: ts("locked_until"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_username_lower_idx").on(sql`lower(${t.username})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the cookie token; the token itself is never stored. */
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Lender rate overrides edited in the Calculators app. Built-in starting data: lib/lenders/data.ts. */
export const lenderRates = pgTable("lender_rates", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** PIN unlock attempts, for the 5-tries lockout. The address is stored only as a keyed hash. */
export const accessAttempts = pgTable(
  "access_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    addressHash: text("address_hash").notNull(),
    ok: boolean("ok").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("access_attempts_addr_idx").on(t.addressHash, t.createdAt)],
);

/** Third-party apps installed by an admin. Built-in apps live in code (lib/apps/catalog.ts). */
export const apps = pgTable("apps", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("app"),
  url: text("url").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  width: integer("width").notNull().default(720),
  height: integer("height").notNull().default(520),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Permissions a user granted to a third-party app (Puter-style requestPermission). */
export const appGrants = pgTable(
  "app_grants",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    appId: text("app_id").notNull(),
    permission: text("permission").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.appId, t.permission] })],
);

/** Per-user virtual file system. Small files only (content up to 1 MB). */
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    parentPath: text("parent_path").notNull(),
    name: text("name").notNull(),
    isDir: boolean("is_dir").notNull().default(false),
    mime: text("mime").notNull().default("text/plain"),
    /** utf8 | base64 */
    encoding: text("encoding").notNull().default("utf8"),
    content: text("content"),
    size: integer("size").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("files_user_path_idx").on(t.userId, t.path), index("files_parent_idx").on(t.userId, t.parentPath)],
);

/** App-scoped key-value store (puter.kv equivalent): each app sees only its own keys. */
export const kv = pgTable(
  "kv",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    appId: text("app_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.appId, t.key] })],
);

/** Harness conversation memory (replaces the harness InMemorySessionStore). */
export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    appId: text("app_id").notNull(),
    title: text("title").notNull().default("New conversation"),
    messages: jsonb("messages").$type<unknown[]>().notNull().default([]),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("chat_sessions_user_idx").on(t.userId, t.updatedAt)],
);

/** One row per AI turn: metering, daily caps and the usage report. */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    appId: text("app_id").notNull(),
    sessionId: uuid("session_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    steps: integer("steps").notNull().default(0),
    tools: jsonb("tools").$type<string[]>().notNull().default([]),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    costPhp: numeric("cost_php", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("usage_user_time_idx").on(t.userId, t.createdAt), index("usage_time_idx").on(t.createdAt)],
);

/** Security-relevant actions: sign-ins, permission grants, installs, admin changes. No personal data in detail. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id"),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_time_idx").on(t.createdAt)],
);

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/**
 * Documents uploaded to Deal Desk for the no-AI Query Engine. Text is extracted in the browser (PDF text layer,
 * DOCX, OCR for images and scans); only the text is stored, never the original file. Summary and facts are
 * computed once at upload (extractive, no AI).
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mime: text("mime").notNull().default("text/plain"),
    /** pdf-text | pdf-ocr | docx | image-ocr | text | note */
    method: text("method").notNull(),
    pages: integer("pages").notNull().default(1),
    chars: integer("chars").notNull().default(0),
    /** Mean OCR confidence 0-100 when OCR was used. */
    ocrConfidence: integer("ocr_confidence"),
    summary: text("summary").notNull().default(""),
    facts: jsonb("facts").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("documents_user_idx").on(t.userId, t.createdAt)],
);

/** Searchable passages of a document (about 900 characters each, split on paragraphs). */
export const documentChunks = pgTable(
  "document_chunks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    seq: integer("seq").notNull(),
    page: integer("page"),
    text: text("text").notNull(),
    search: tsvector("search").generatedAlwaysAs(sql`to_tsvector('simple', text)`),
  },
  (t) => [index("doc_chunks_doc_idx").on(t.documentId, t.seq), index("doc_chunks_search_idx").using("gin", t.search), index("doc_chunks_user_idx").on(t.userId)],
);

/**
 * A person's own AI provider keys (default is no AI). Keys are encrypted with AES-256-GCM using a key derived
 * from APP_SECRET and are never sent back to the browser; only the last 4 characters are kept in clear.
 */
export const aiKeys = pgTable(
  "ai_keys",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** anthropic | openai | openrouter | gemini | custom */
    provider: text("provider").notNull(),
    keyEnc: text("key_enc").notNull(),
    keyHint: text("key_hint").notNull(),
    baseUrl: text("base_url").notNull().default(""),
    model: text("model").notNull(),
    budgetModel: text("budget_model").notNull().default(""),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);

/** Property Teaser projects (presentation decks and teaser trailers). The design is one JSON document. */
export const teasers = pgTable(
  "teasers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    templateId: text("template_id").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    /** Small JPEG data URL of the first slide, for the project list. */
    thumb: text("thumb").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("teasers_user_idx").on(t.userId, t.updatedAt)],
);

/** Images used in teasers: uploads, logos and pictures imported from the web (with their credit). */
export const teaserAssets = pgTable(
  "teaser_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    mime: text("mime").notNull(),
    /** base64 */
    data: text("data").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    /** upload | logo | web */
    source: text("source").notNull().default("upload"),
    name: text("name").notNull().default(""),
    /** Credit line for web images (title, creator, licence). */
    credit: text("credit").notNull().default(""),
    sourceUrl: text("source_url").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("teaser_assets_user_idx").on(t.userId, t.createdAt)],
);
