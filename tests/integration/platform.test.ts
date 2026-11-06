import { beforeAll, describe, expect, it } from "vitest";
import { BUILTIN_APPS, DESKTOP_APP, type AppInfo } from "@/lib/apps/catalog";
import { callDriver, type Actor } from "@/lib/server/drivers";
import { DriverError } from "@/lib/server/errors";
import { createUser, login, validateSession, type PublicUser } from "@/lib/server/services/auth";
import { installApp, resolveApp } from "@/lib/server/services/apps";
import { seedDemoListings } from "@/lib/listings/import";
import { freshListingsDb } from "../helpers/listings-db";
import { normalizePath } from "@/lib/server/services/fs";
import { freshDb } from "../helpers/db";

const PW = "correct horse battery staple grid";
let admin: PublicUser;
let sales: PublicUser;
let other: PublicUser;
const app = (id: string) => BUILTIN_APPS.find((a) => a.id === id)!;
const as = (user: PublicUser, a: AppInfo): Actor => ({ user, sessionId: "test", app: a });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof DriverError ? e.code : String(e);
  }
};

beforeAll(async () => {
  process.env.HARNESS_DEMO_PROVIDER = "true";
  process.env.ANTHROPIC_API_KEY = "";
  process.env.OPENAI_API_KEY = "";
  process.env.GEMINI_API_KEY = "";
  await freshDb();
  admin = await createUser({ username: "admin1", password: PW, role: "admin" });
  sales = await createUser({ username: "sales1", password: PW, role: "salesperson" });
  other = await createUser({ username: "sales2", password: PW, role: "salesperson" });
  await freshListingsDb();
  await seedDemoListings();
});

describe("auth", () => {
  it("logs in, validates the session and rejects a wrong password", async () => {
    const ok = await login("SALES1", PW);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect((await validateSession(ok.token))?.user.username).toBe("sales1");
    expect((await login("sales1", "wrong password wrong password")).ok).toBe(false);
    expect(await validateSession("nope")).toBeNull();
  });

  it("locks the account after 5 failed attempts", async () => {
    await createUser({ username: "lockme", password: PW, role: "salesperson" });
    for (let i = 0; i < 5; i++) await login("lockme", "not the password at all!!");
    const r = await login("lockme", PW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/15 minutes/);
  });

  it("refuses weak passwords and duplicate usernames", async () => {
    expect(await code(createUser({ username: "weak", password: "short", role: "broker" }))).toBe("invalid_input");
    expect(await code(createUser({ username: "Sales1", password: PW, role: "broker" }))).toBe("invalid_input");
  });
});

describe("driver gate", () => {
  it("lets built-in apps use only the permissions they declare", async () => {
    expect(await code(callDriver(as(sales, app("calculators")), "tools.run", { name: "compute_commission", args: { salePrice: 9_800_000, commissionRatePercent: 5 } }))).toBe("ok");
    expect(await code(callDriver(as(sales, app("calculators")), "listings.search", {}))).toBe("permission_denied");
    expect(await code(callDriver(as(sales, app("notes")), "ai.chat", { message: "hi" }))).toBe("permission_denied");
  });

  it("applies roles: salespersons cannot edit listings or manage users", async () => {
    const l = { name: "Test lot", location: "Lipa, Batangas", transactionType: "sale", propertyType: "land", price: 1_500_000 };
    expect(await code(callDriver(as(sales, app("listings")), "listings.save", l))).toBe("permission_denied");
    expect(await code(callDriver(as(admin, app("listings")), "listings.save", l))).toBe("ok");
    expect(await code(callDriver(as(sales, app("settings")), "users.list", {}))).toBe("permission_denied");
    expect(await code(callDriver(as(admin, app("settings")), "users.list", {}))).toBe("ok");
  });

  it("requires a user grant for third-party apps, granted only through the desktop", async () => {
    await installApp(admin.id, { id: "loan-widget", name: "Loan Widget", description: "", icon: "app", url: "/sample-apps/loan-widget/index.html", permissions: ["tools"], width: 600, height: 500 });
    const ext = (await resolveApp("loan-widget"))!;
    const run = () => callDriver(as(sales, ext), "tools.run", { name: "compute_maceda_refund", args: { totalPaymentsMade: 900000, yearsOfInstallmentsPaid: 6 } });
    expect(await code(run())).toBe("permission_required");
    expect(await code(callDriver(as(sales, ext), "apps.grant", { appId: "loan-widget", permission: "tools" }))).toBe("permission_denied");
    expect(await code(callDriver(as(sales, DESKTOP_APP), "apps.grant", { appId: "loan-widget", permission: "ai" }))).toBe("invalid_input");
    expect(await code(callDriver(as(sales, DESKTOP_APP), "apps.grant", { appId: "loan-widget", permission: "tools" }))).toBe("ok");
    expect(((await run()) as { cashSurrenderValue: number }).cashSurrenderValue).toBe(495_000);
    // Another user has not granted it.
    expect(await code(callDriver(as(other, ext), "tools.run", { name: "compute_maceda_refund", args: { totalPaymentsMade: 1, yearsOfInstallmentsPaid: 1 } }))).toBe("permission_required");
    // Undeclared and system permissions stay closed.
    expect(await code(callDriver(as(sales, ext), "fs.list", { path: "/" }))).toBe("permission_denied");
    expect(await code(callDriver(as(sales, ext), "apps.list", {}))).toBe("permission_denied");
  });

  it("rejects unknown methods and bad arguments", async () => {
    expect(await code(callDriver(as(sales, app("calculators")), "tools.nope", {}))).toBe("unknown_method");
    expect(await code(callDriver(as(sales, app("calculators")), "tools.run", { name: "compute_commission", args: { salePrice: "abc", commissionRatePercent: 5 } }))).toBe("invalid_input");
  });
});

describe("kv and files", () => {
  it("scopes kv to the app and the user", async () => {
    await callDriver(as(sales, app("notes")), "kv.set", { key: "k", value: { a: 1 } });
    expect(await callDriver(as(sales, app("notes")), "kv.get", { key: "k" })).toEqual({ a: 1 });
    expect(await callDriver(as(sales, app("files")), "kv.get", { key: "k" })).toBeNull();
    expect(await callDriver(as(other, app("notes")), "kv.get", { key: "k" })).toBeNull();
  });

  it("normalizes paths and blocks traversal above the root", () => {
    expect(normalizePath("/a/./b/../c/")).toBe("/a/c");
    expect(normalizePath("/../../etc/passwd")).toBe("/etc/passwd");
    expect(() => normalizePath("relative")).toThrow();
  });

  it("writes, lists, renames folders with children, and deletes", async () => {
    const f = (m: string, p: unknown) => callDriver(as(sales, app("files")), m, p);
    const root = (await f("fs.list", { path: "/" })) as { name: string }[];
    expect(root.map((x) => x.name)).toEqual(["Deals", "Desktop", "Documents"]);
    await f("fs.write", { path: "/Deals/Acme/quote.md", content: "# Quote", createParents: true });
    await f("fs.rename", { from: "/Deals/Acme", to: "/Deals/Acme Corp" });
    expect(((await f("fs.read", { path: "/Deals/Acme Corp/quote.md" })) as { content: string }).content).toBe("# Quote");
    expect(await code(f("fs.read", { path: "/Deals/Acme/quote.md" }))).toBe("not_found");
    expect(await code(callDriver(as(other, app("files")), "fs.read", { path: "/Deals/Acme Corp/quote.md" }))).toBe("not_found");
    expect(await code(f("fs.write", { path: "/Documents/big.txt", content: "x".repeat(1024 * 1024 + 1) }))).toBe("invalid_input");
    expect(((await f("fs.delete", { path: "/Deals/Acme Corp" })) as { deleted: number }).deleted).toBe(2);
  });
});

describe("AI driver (harness)", () => {
  it("runs a demo turn with real calculators, records usage and keeps the session private", async () => {
    const dd = app("deal-desk");
    const turn = (await callDriver(as(sales, dd), "ai.chat", { message: "Cost to buy a ₱7.6M condo in Pasig?", provider: "demo" })) as {
      reply: string;
      sessionId: string;
      toolTrace: { name: string; result: { totals: { buyer: number } } }[];
    };
    expect(turn.toolTrace[0]!.name).toBe("compute_acquisition_costs");
    expect(turn.toolTrace[0]!.result.totals.buyer).toBe(190_000);
    expect(turn.reply).toContain("₱");
    const sessions = (await callDriver(as(sales, dd), "ai.sessions", {})) as { id: string }[];
    expect(sessions.map((s) => s.id)).toContain(turn.sessionId);
    expect(await code(callDriver(as(other, dd), "ai.session", { sessionId: turn.sessionId }))).toBe("not_found");
    const usage = (await callDriver(as(sales, app("settings")), "usage.mine", {})) as { today: { turns: number } };
    expect(usage.today.turns).toBe(1);
  });

  it("searches listings from the database inventory", async () => {
    const turn = (await callDriver(as(sales, app("deal-desk")), "ai.chat", { message: "2BR condos in Pasig under ₱8M", provider: "demo" })) as {
      toolTrace: { name: string; result: { listings: { code: string; city: string }[] } }[];
    };
    expect(turn.toolTrace[0]!.name).toBe("listings.search");
    expect(turn.toolTrace[0]!.result.listings.length).toBeGreaterThan(0);
    expect(turn.toolTrace[0]!.result.listings.every((l) => l.city === "Pasig")).toBe(true);
  });

  it("says when a provider has no key; the AI cap does not block the free Query Engine", async () => {
    expect(await code(callDriver(as(sales, app("deal-desk")), "ai.chat", { message: "hi", provider: "anthropic" }))).toBe("provider_not_configured");
    const { getDb } = await import("@/lib/db/client");
    const { usageEvents } = await import("@/lib/db/schema");
    await (await getDb()).insert(usageEvents).values({ userId: other.id, appId: "deal-desk", provider: "anthropic", model: "x", costPhp: "5000" });
    expect(await code(callDriver(as(other, app("deal-desk")), "ai.chat", { message: "hi", provider: "openai" }))).toMatch(/daily_cap_reached|provider_not_configured/);
    // The no-AI Query Engine costs nothing, so the AI cap does not block it.
    expect(await code(callDriver(as(other, app("deal-desk")), "ai.chat", { message: "hi", provider: "demo" }))).toBe("ok");
  });
});
