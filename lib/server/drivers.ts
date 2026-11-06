/**
 * Driver registry: every capability an app can use, behind one RPC surface (POST /api/drivers/call),
 * modelled on Puter's drivers layer. Each method declares its argument schema; the gate in callDriver()
 * applies the permission model from lib/apps/permissions.ts before any service runs.
 *
 *   app iframe --grid.js postMessage--> desktop (IPC gate) --fetch--> /api/drivers/call (driver gate) --> services
 */
import { z } from "zod";
import { DESKTOP_APP_ID, type AppInfo } from "@/lib/apps/catalog";
import { GRANTABLE, METHOD_PERMISSION, type Permission, type Role } from "@/lib/apps/permissions";
import { ToolRegistry } from "@/lib/harness";
import { runAs } from "@/lib/db/client";
import { denied, DriverError, invalid } from "./errors";
import * as ai from "./services/ai";
import * as aiKeys from "./services/ai-keys";

/** AI keys are managed only from GRID's own apps (Deal Desk, Settings), never by third-party apps. */
function builtinOnly(a: Actor) {
  if (a.app.kind !== "builtin") throw new DriverError("permission_denied", "Only GRID's own apps can manage AI keys.", 403);
}
import * as appsSvc from "./services/apps";
import * as auth from "./services/auth";
import * as fs from "./services/fs";
import * as kvSvc from "./services/kv";
import * as usage from "./services/usage";
import * as listingsSvc from "./services/listings";
import * as lendersSvc from "./services/lenders";
import * as docsSvc from "./services/documents";
import * as teaserSvc from "./services/teasers";
import type { AppBridge } from "@/lib/agent/app-tools";
import { listingForm } from "@/lib/listings/manage";
import { searchInput } from "@/lib/listings/search";
import { buyerInput } from "@/lib/listings/buyers";
import { buyerCriteria } from "@/lib/listings/match";

export interface Actor {
  user: auth.PublicUser;
  sessionId: string;
  app: AppInfo;
}

interface Method<S extends z.ZodType> {
  /** CQRS: commands change state (write database); queries only read (read replica). Default from the name. */
  kind?: "command" | "query";
  schema: S;
  roles?: Role[];
  /** Only the desktop itself (not apps) may call this. */
  desktopOnly?: boolean;
  run: (actor: Actor, args: z.infer<S>) => unknown | Promise<unknown>;
}
const m = <S extends z.ZodType>(def: Method<S>) => def;

const tools = new ToolRegistry();
const path = z.string().min(1).max(600);
const none = z.object({}).passthrough();

export const METHODS = {
  "auth.whoami": m({ schema: none, run: (a) => ({ ...a.user, app: { id: a.app.id, name: a.app.name } }) }),

  "kv.get": m({ schema: z.object({ key: z.string() }), run: (a, x) => kvSvc.kvGet(a.user.id, a.app.id, x.key) }),
  "kv.set": m({ schema: z.object({ key: z.string(), value: z.unknown() }), run: (a, x) => kvSvc.kvSet(a.user.id, a.app.id, x.key, x.value) }),
  "kv.del": m({ schema: z.object({ key: z.string() }), run: (a, x) => kvSvc.kvDel(a.user.id, a.app.id, x.key) }),
  "kv.list": m({ schema: z.object({ prefix: z.string().max(200).optional() }), run: (a, x) => kvSvc.kvList(a.user.id, a.app.id, x.prefix) }),

  "ai.chat": m({
    schema: z.object({ message: z.string(), sessionId: z.string().max(100).optional(), provider: z.string().max(60).optional(), tier: z.enum(["balanced", "budget"]).optional(), mode: z.enum(ai.MODES).optional() }),
    run: (a, x) => ai.chat(a.user.id, a.app.id, x, appBridge(a)),
  }),
  "ai.providers": m({ schema: none, run: (a) => ai.providerList(a.user.id) }),
  "ai.status": m({ schema: none, run: (a) => ai.aiStatus(a.user.id) }),
  // Your own AI keys (Settings). Keys go in, never come back out.
  "ai.keys.list": m({ schema: none, run: (a) => (builtinOnly(a), aiKeys.listKeys(a.user.id)) }),
  "ai.keys.save": m({ kind: "command", schema: aiKeys.keyInput, run: (a, x) => (builtinOnly(a), aiKeys.saveKey(a.user.id, x)) }),
  "ai.keys.remove": m({ kind: "command", schema: z.object({ id: z.string().uuid() }), run: (a, x) => (builtinOnly(a), aiKeys.removeKey(a.user.id, x.id)) }),
  "ai.keys.presets": m({ schema: none, run: () => aiKeys.keyPresets() }),
  "ai.keys.test": m({ kind: "query", schema: aiKeys.keyInput, run: (a, x) => (builtinOnly(a), aiKeys.testKey(a.user.id, x)) }),
  "ai.sessions": m({ schema: none, run: (a) => ai.listSessions(a.user.id, a.app.id) }),
  "ai.session": m({ schema: z.object({ sessionId: z.string() }), run: (a, x) => ai.getSession(a.user.id, a.app.id, x.sessionId) }),
  "ai.deleteSession": m({ schema: z.object({ sessionId: z.string() }), run: (a, x) => ai.deleteSession(a.user.id, a.app.id, x.sessionId) }),

  "tools.list": m({ schema: none, run: () => tools.definitions() }),
  "tools.run": m({
    schema: z.object({ name: z.string().max(60), args: z.record(z.string(), z.unknown()).default({}) }),
    run: async (_a, x) => {
      if (!tools.has(x.name)) throw invalid(`Unknown tool "${x.name}".`);
      const out = await tools.execute(x.name, x.args);
      if (!out.ok) throw invalid((out.result as { error: string }).error);
      return out.result;
    },
  }),

  // Documents for the Query Engine: text is extracted in the browser; only text reaches the server.
  "docs.list": m({ schema: none, run: (a) => docsSvc.listDocuments(a.user.id) }),
  "docs.notes": m({ schema: none, run: async (a) => (await docsSvc.recentNotes(a.user.id, 30)).filter((n) => !/^\/Deals\/deal-desk-/.test(n.path)).map(({ path, name, updatedAt, content }) => ({ path, name, updatedAt, preview: content.slice(0, 140) })) }),
  "docs.get": m({ schema: z.object({ id: z.string().uuid(), withText: z.boolean().optional() }), run: (a, x) => docsSvc.getDocument(a.user.id, x.id, x.withText) }),
  "docs.search": m({ schema: z.object({ q: z.string().min(1).max(300), limit: z.number().int().min(1).max(20).optional() }), run: (a, x) => docsSvc.searchDocuments(a.user.id, x.q, { limit: x.limit }) }),
  "docs.add": m({ kind: "command", schema: docsSvc.docInput, run: (a, x) => docsSvc.addDocument(a.user.id, x) }),
  "docs.delete": m({ kind: "command", schema: z.object({ id: z.string().uuid() }), run: (a, x) => docsSvc.deleteDocument(a.user.id, x.id) }),
  // Property Teaser: projects, images (uploads, web search and import), Polish with AI (own key only).
  "teaser.list": m({ schema: none, run: (a) => teaserSvc.listTeasers(a.user.id) }),
  "teaser.get": m({ schema: z.object({ id: z.string().uuid() }), run: (a, x) => teaserSvc.getTeaser(a.user.id, x.id) }),
  "teaser.save": m({ kind: "command", schema: teaserSvc.teaserInput, run: (a, x) => teaserSvc.saveTeaser(a.user.id, x) }),
  "teaser.delete": m({ kind: "command", schema: z.object({ id: z.string().uuid() }), run: (a, x) => teaserSvc.deleteTeaser(a.user.id, x.id) }),
  "teaser.duplicate": m({ kind: "command", schema: z.object({ id: z.string().uuid() }), run: (a, x) => teaserSvc.duplicateTeaser(a.user.id, x.id) }),
  "teaser.templates": m({ schema: none, run: (a) => teaserSvc.listTemplates(a.user.id) }),
  "teaser.getTemplate": m({ schema: z.object({ id: z.string().uuid() }), run: (a, x) => teaserSvc.getTemplate(a.user.id, x.id) }),
  "teaser.saveTemplate": m({ kind: "command", schema: teaserSvc.templateInput, run: (a, x) => teaserSvc.saveTemplate(a.user.id, x) }),
  "teaser.deleteTemplate": m({ kind: "command", schema: z.object({ id: z.string().uuid() }), run: (a, x) => teaserSvc.deleteTemplate(a.user.id, x.id) }),
  "teaser.assets": m({ schema: z.object({ source: z.enum(["upload", "logo", "web"]).optional() }), run: (a, x) => teaserSvc.listAssets(a.user.id, x.source) }),
  "teaser.addAsset": m({ kind: "command", schema: teaserSvc.assetInput, run: (a, x) => teaserSvc.addAsset(a.user.id, x) }),
  "teaser.deleteAsset": m({ kind: "command", schema: z.object({ id: z.string().uuid() }), run: (a, x) => teaserSvc.deleteAsset(a.user.id, x.id) }),
  "teaser.searchWeb": m({ schema: z.object({ q: z.string().max(120), page: z.number().int().min(1).max(20).optional() }), run: (_a, x) => teaserSvc.searchWebImages(x.q, x.page) }),
  "teaser.importUrl": m({ kind: "command", schema: teaserSvc.importInput, run: (a, x) => teaserSvc.importFromUrl(a.user.id, x) }),
  "teaser.polish": m({ kind: "command", schema: teaserSvc.polishInput, run: (a, x) => teaserSvc.polishWithAi(a.user.id, x) }),
  "lenders.list": m({ schema: none, run: () => lendersSvc.listLenders() }),
  "lenders.compare": m({
    schema: z.object({
      propertyPrice: z.number().positive().max(1e12),
      downPaymentPercent: z.number().min(0).max(100).optional(),
      downPaymentAmount: z.number().min(0).optional(),
      termYears: z.number().int().min(1).max(35),
      fixYears: z.number().int().min(1).max(30).optional(),
      monthlyGrossIncome: z.number().min(0).optional(),
      borrowerAge: z.number().int().min(18).max(80).optional(),
      quotedRatePct: z.number().min(0).max(40).optional(),
      usePromo: z.boolean().optional(),
      maxDtiPct: z.number().min(10).max(80).optional(),
      lenderIds: z.array(z.string().max(40)).max(30).optional(),
    }),
    run: (_a, x) => lendersSvc.compare(x),
  }),
  "lenders.save": m({ kind: "command", schema: lendersSvc.lenderInput, roles: ["admin", "broker"], run: (a, x) => lendersSvc.saveLender(x, a.user.id) }),
  "lenders.reset": m({ kind: "command", schema: z.object({ id: z.string().max(40) }), roles: ["admin", "broker"], run: (a, x) => lendersSvc.resetLender(x.id, a.user.id) }),

  "listings.search": m({ schema: searchInput, run: (_a, x) => listingsSvc.search(x) }),
  "listings.ask": m({
    schema: z.object({ text: z.string().trim().min(1).max(300), limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).max(50_000).optional(), sort: z.enum(["relevance", "price_asc", "price_desc", "newest"]).optional() }),
    run: (_a, x) => listingsSvc.ask(x.text, { limit: x.limit, offset: x.offset, sort: x.sort }),
  }),
  "listings.facets": m({ schema: none, run: () => listingsSvc.index() }),
  "listings.get": m({
    schema: z.object({ code: z.string().max(60) }),
    run: (a, x) => listingsSvc.get(x.code, { withContact: a.app.kind === "builtin" && (a.user.role === "admin" || a.user.role === "broker") }),
  }),
  "listings.save": m({ kind: "command", schema: listingForm, roles: ["admin", "broker"], run: (a, x) => listingsSvc.save(x, a.user) }),
  "listings.delete": m({ kind: "command", schema: z.object({ code: z.string().max(60) }), roles: ["admin", "broker"], run: (a, x) => listingsSvc.remove(x.code, a.user.id) }),

  "match.run": m({
    schema: z.object({ criteria: buyerCriteria, limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).max(50_000).optional() }),
    run: (_a, x) => listingsSvc.match(x.criteria, { limit: x.limit, offset: x.offset }),
  }),
  "match.buyers": m({ schema: none, run: () => listingsSvc.buyers() }),
  "match.saveBuyer": m({ kind: "command", schema: buyerInput, run: (a, x) => listingsSvc.saveBuyerProfile(x, a.user.id) }),
  "match.deleteBuyer": m({ kind: "command", schema: z.object({ id: z.string().uuid() }), run: (a, x) => listingsSvc.deleteBuyerProfile(x.id, a.user.id) }),
  "match.buyerMatches": m({
    schema: z.object({ id: z.string().uuid(), limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).max(50_000).optional() }),
    run: (_a, x) => listingsSvc.buyerMatches(x.id, { limit: x.limit, offset: x.offset }),
  }),
  "match.listingBuyers": m({ schema: z.object({ code: z.string().max(60) }), run: (_a, x) => listingsSvc.listingBuyers(x.code) }),
  "listings.import": m({
    kind: "command",
    schema: z.object({ fileName: z.string().max(200), csv: z.string().max(8 * 1024 * 1024) }),
    roles: ["admin", "broker"],
    run: (a, x) => listingsSvc.importCsv(x, a.user.id),
  }),
  "listings.imports": m({ schema: none, roles: ["admin", "broker"], run: () => listingsSvc.imports() }),

  "fs.list": m({ schema: z.object({ path: path.default("/") }), run: (a, x) => fs.list(a.user.id, x.path) }),
  "fs.stat": m({ schema: z.object({ path }), run: (a, x) => fs.stat(a.user.id, x.path) }),
  "fs.read": m({ schema: z.object({ path }), run: (a, x) => fs.read(a.user.id, x.path) }),
  "fs.write": m({
    schema: z.object({
      path,
      content: z.string(),
      encoding: z.enum(["utf8", "base64"]).optional(),
      mime: z.string().max(100).optional(),
      overwrite: z.boolean().optional(),
      createParents: z.boolean().optional(),
    }),
    run: (a, x) => fs.write(a.user.id, x),
  }),
  "fs.mkdir": m({ schema: z.object({ path, createParents: z.boolean().optional() }), run: (a, x) => fs.mkdir(a.user.id, x.path, x.createParents) }),
  "fs.rename": m({ schema: z.object({ from: path, to: path }), run: (a, x) => fs.rename(a.user.id, x.from, x.to) }),
  "fs.delete": m({ schema: z.object({ path }), run: (a, x) => fs.remove(a.user.id, x.path) }),

  "usage.mine": m({ schema: none, run: (a) => usage.myUsage(a.user.id) }),
  "usage.all": m({ schema: none, roles: ["admin"], run: () => usage.allUsage() }),

  "apps.list": m({ schema: none, run: (a) => appsSvc.listApps(a.user.role) }),
  "apps.install": m({ schema: appsSvc.installInput, roles: ["admin"], run: (a, x) => appsSvc.installApp(a.user.id, x) }),
  "apps.uninstall": m({ schema: z.object({ appId: z.string().max(40) }), roles: ["admin"], run: (a, x) => appsSvc.uninstallApp(a.user.id, x.appId) }),
  "apps.grants": m({ schema: z.object({ appId: z.string().max(40).optional() }), run: (a, x) => appsSvc.grantsFor(a.user.id, x.appId) }),
  "apps.grant": m({
    schema: z.object({ appId: z.string().max(40), permission: z.enum(GRANTABLE as [Permission, ...Permission[]]) }),
    desktopOnly: true,
    run: (a, x) => appsSvc.grant(a.user.id, x.appId, x.permission),
  }),
  "apps.revoke": m({
    schema: z.object({ appId: z.string().max(40), permission: z.enum(GRANTABLE as [Permission, ...Permission[]]).optional() }),
    run: (a, x) => appsSvc.revoke(a.user.id, x.appId, x.permission),
  }),

  "users.list": m({ schema: none, roles: ["admin"], run: () => auth.listUsers() }),
  "users.create": m({
    schema: z.object({ username: z.string().max(32), displayName: z.string().max(80).optional(), password: z.string().max(128), role: z.enum(["admin", "broker", "salesperson"]) }),
    roles: ["admin"],
    run: (a, x) => auth.createUser({ ...x, mustChangePassword: true }).then(async (u) => {
      const { audit } = await import("./services/audit");
      await audit(a.user.id, "users.create", { target: u.publicId, role: u.role });
      return u;
    }),
  }),
  "users.update": m({
    schema: z.object({ userId: z.string().uuid(), role: z.enum(["admin", "broker", "salesperson"]).optional(), disabled: z.boolean().optional(), displayName: z.string().max(80).optional() }),
    roles: ["admin"],
    run: (a, { userId, ...patch }) => auth.updateUser(a.user.id, userId, patch),
  }),
  "users.resetPassword": m({
    schema: z.object({ userId: z.string().uuid(), temporaryPassword: z.string().max(128) }),
    roles: ["admin"],
    run: (a, x) => auth.adminResetPassword(a.user.id, x.userId, x.temporaryPassword).then(() => true),
  }),
  "account.update": m({ schema: z.object({ displayName: z.string().max(80) }), run: (a, x) => auth.updateDisplayName(a.user.id, x.displayName).then(() => true) }),
  "account.changePassword": m({
    schema: z.object({ current: z.string().max(128), next: z.string().max(128) }),
    run: (a, x) => auth.changePassword(a.user.id, x.current, x.next, a.sessionId).then(() => true),
  }),
} satisfies Record<string, Method<z.ZodType>>;

export type MethodName = keyof typeof METHODS;

const COMMAND_VERBS = /\.(set|del|save\w*|delete\w*|write|mkdir|rename|install|uninstall|grant|revoke|create|update|reset\w*|change\w*|chat|import|add\w*|upload\w*|setRate\w*)$/;
/** command or query, for the CQRS split (exported for tests and the route's x-grid-cqrs header). */
export function methodKind(method: string): "command" | "query" {
  const def = (METHODS as Record<string, Method<z.ZodType>>)[method];
  return def?.kind ?? (COMMAND_VERBS.test(method) ? "command" : "query");
}

/**
 * The driver gate. Order: known method → permission for this app → role → argument schema → service.
 * Built-in apps hold the permissions they declare; third-party apps also need the user's grant.
 */
/**
 * The Agent harness reaches the apps through this bridge: the same gate as callDriver, as the app the person
 * is using. AI chat itself is never reachable from a tool.
 */
function appBridge(actor: Actor): AppBridge {
  const defs = METHODS as Record<string, Method<z.ZodType>>;
  return {
    allowed: (method: string) => {
      if (!(method in defs) || !(method in METHOD_PERMISSION) || method.startsWith("ai.")) return false;
      const perm = METHOD_PERMISSION[method];
      const def = defs[method]!;
      return (!perm || actor.app.permissions.includes(perm)) && (!def.roles || def.roles.includes(actor.user.role)) && !def.desktopOnly;
    },
    schema: (method: string) => defs[method]?.schema,
    call: (method: string, params: unknown): Promise<unknown> => (method.startsWith("ai.") ? Promise.reject(denied()) : callDriver(actor, method, params)),
  };
}

export async function callDriver(actor: Actor, method: string, params: unknown): Promise<unknown> {
  const def = (METHODS as Record<string, Method<z.ZodType>>)[method];
  if (!def || !(method in METHOD_PERMISSION)) throw new DriverError("unknown_method", `Unknown method "${method}".`, 404);
  const perm = METHOD_PERMISSION[method];
  if (def.desktopOnly && actor.app.id !== DESKTOP_APP_ID) throw denied();
  if (perm) {
    if (!actor.app.permissions.includes(perm)) throw denied(`${actor.app.name} did not declare the "${perm}" permission.`);
    if (actor.app.kind === "external") {
      if (perm === "system") throw denied();
      if (!(await appsSvc.hasGrant(actor.user.id, actor.app.id, perm)))
        throw new DriverError("permission_required", `Allow ${actor.app.name} to use "${perm}" first.`, 403);
    }
  }
  if (def.roles && !def.roles.includes(actor.user.role)) throw denied("Your role cannot do that.");
  const parsed = def.schema.safeParse(params ?? {});
  if (!parsed.success) throw invalid(parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  // Queries run in read mode: every getDb() inside goes to the read replica (when configured).
  return runAs(methodKind(method) === "query" ? "read" : "write", async () => def.run(actor, parsed.data));
}
