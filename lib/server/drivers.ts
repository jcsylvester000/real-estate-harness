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
import { denied, DriverError, invalid } from "./errors";
import * as ai from "./services/ai";
import * as appsSvc from "./services/apps";
import * as auth from "./services/auth";
import * as fs from "./services/fs";
import * as kvSvc from "./services/kv";
import * as usage from "./services/usage";
import * as listingsSvc from "./services/listings";
import { listingForm } from "@/lib/listings/manage";
import { searchInput } from "@/lib/listings/search";

export interface Actor {
  user: auth.PublicUser;
  sessionId: string;
  app: AppInfo;
}

interface Method<S extends z.ZodType> {
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
    schema: z.object({ message: z.string(), sessionId: z.string().max(100).optional(), provider: z.string().max(20).optional(), tier: z.enum(["balanced", "budget"]).optional() }),
    run: (a, x) => ai.chat(a.user.id, a.app.id, x),
  }),
  "ai.providers": m({ schema: none, run: () => ai.providerList() }),
  "ai.status": m({ schema: none, run: () => ai.aiStatus() }),
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
  "listings.save": m({ schema: listingForm, roles: ["admin", "broker"], run: (a, x) => listingsSvc.save(x, a.user) }),
  "listings.delete": m({ schema: z.object({ code: z.string().max(60) }), roles: ["admin", "broker"], run: (_a, x) => listingsSvc.remove(x.code) }),
  "listings.import": m({
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

/**
 * The driver gate. Order: known method → permission for this app → role → argument schema → service.
 * Built-in apps hold the permissions they declare; third-party apps also need the user's grant.
 */
export async function callDriver(actor: Actor, method: string, params: unknown) {
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
  return def.run(actor, parsed.data);
}
