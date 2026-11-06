import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BUILTIN_APPS, type AppInfo } from "@/lib/apps/catalog";
import { callDriver, type Actor } from "@/lib/server/drivers";
import { createUser, type PublicUser } from "@/lib/server/services/auth";
import { readAsset, setWebImpl } from "@/lib/server/services/teasers";
import { freshDb } from "../helpers/db";
import { freshListingsDb } from "../helpers/listings-db";

let user: PublicUser;
let other: PublicUser;
const app = (id: string) => BUILTIN_APPS.find((a) => a.id === id)!;
const as = (u: PublicUser, a: AppInfo = app("property-teaser")): Actor => ({ user: u, sessionId: "t", app: a });
// 1×1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

beforeAll(async () => {
  process.env.APP_SECRET ||= "test-secret-test-secret-test-secret-123";
  await freshDb();
  await freshListingsDb();
  user = await createUser({ username: "designer", password: "a long pass phrase 123", role: "broker" });
  other = await createUser({ username: "other1", password: "a long pass phrase 123", role: "broker" });
});
afterEach(() => vi.unstubAllGlobals());

describe("Property Teaser projects", () => {
  let id = "";
  it("saves, lists, opens, duplicates and deletes, per user", async () => {
    const r = (await callDriver(as(user), "teaser.save", { kind: "deck", title: "Casa Verde", templateId: "grid-signature", data: { v: 1, slides: [] }, thumb: `data:image/png;base64,${PNG.toString("base64")}` })) as { id: string };
    id = r.id;
    expect((await callDriver(as(user), "teaser.list", {})) as unknown[]).toHaveLength(1);
    expect(await callDriver(as(other), "teaser.list", {})).toEqual([]);
    await expect(callDriver(as(other), "teaser.get", { id })).rejects.toMatchObject({ code: "not_found" });
    await callDriver(as(user), "teaser.save", { id, kind: "deck", title: "Casa Verde 2", templateId: "grid-signature", data: { v: 1, slides: [1] } });
    expect(await callDriver(as(user), "teaser.get", { id })).toMatchObject({ title: "Casa Verde 2", data: { slides: [1] } });
    await callDriver(as(user), "teaser.duplicate", { id });
    expect(((await callDriver(as(user), "teaser.list", {})) as { title: string }[]).map((x) => x.title)).toContain("Casa Verde 2 (copy)");
    await callDriver(as(user), "teaser.delete", { id });
  });
  it("rejects a thumbnail that is not an image data URL", async () => {
    await expect(callDriver(as(user), "teaser.save", { kind: "deck", title: "X", templateId: "t", data: {}, thumb: "javascript:alert(1)" })).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("saved designs (my templates)", () => {
  it("saves, lists, opens and deletes designs per user; Deal Desk can use them", async () => {
    const r = (await callDriver(as(user), "teaser.saveTemplate", { name: "Cruz Realty navy", kind: "deck", data: { v: 1, slides: [] } })) as { id: string };
    expect((await callDriver(as(user), "teaser.templates", {})) as { name: string }[]).toEqual([expect.objectContaining({ name: "Cruz Realty navy", kind: "deck" })]);
    expect(await callDriver(as(other), "teaser.templates", {})).toEqual([]);
    await expect(callDriver(as(other), "teaser.getTemplate", { id: r.id })).rejects.toMatchObject({ code: "not_found" });
    expect(await callDriver(as(user, app("deal-desk")), "teaser.getTemplate", { id: r.id })).toMatchObject({ name: "Cruz Realty navy", data: { v: 1 } });
    await callDriver(as(user), "teaser.saveTemplate", { id: r.id, name: "Renamed", kind: "deck", data: { v: 1, slides: [1] } });
    expect(await callDriver(as(user), "teaser.getTemplate", { id: r.id })).toMatchObject({ name: "Renamed" });
    await expect(callDriver(as(other), "teaser.deleteTemplate", { id: r.id })).rejects.toMatchObject({ code: "not_found" });
    await callDriver(as(user), "teaser.deleteTemplate", { id: r.id });
    expect(await callDriver(as(user), "teaser.templates", {})).toEqual([]);
  });
  it("needs a name", async () => {
    await expect(callDriver(as(user), "teaser.saveTemplate", { name: " ", kind: "deck", data: {} })).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("images", () => {
  it("stores real images only, readable by the owner only", async () => {
    const a = (await callDriver(as(user), "teaser.addAsset", { dataUrl: `data:image/png;base64,${PNG.toString("base64")}`, width: 1, height: 1, name: "dot.png" })) as { id: string; src: string; mime: string };
    expect(a).toMatchObject({ mime: "image/png", src: `asset:${a.id}` });
    expect((await readAsset(user.id, a.id))?.body.equals(PNG)).toBe(true);
    expect(await readAsset(other.id, a.id)).toBeNull();
    // An SVG (or anything else) dressed up as PNG is refused by its bytes.
    await expect(callDriver(as(user), "teaser.addAsset", { dataUrl: `data:image/png;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}` })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("imports a web image safely: public hosts only, redirects re-checked, type sniffed", async () => {
    const hosts: Record<string, string[]> = { "img.example.com": ["93.184.216.34"], "internal.example.com": ["10.0.0.5"] };
    setWebImpl(
      (async (url: string) => {
        if (url.includes("redirect")) return new Response(null, { status: 302, headers: { location: "http://internal.example.com/secret.png" } });
        if (url.includes("page.html")) return new Response("<html>", { status: 200, headers: { "content-type": "text/html" } });
        return new Response(PNG, { status: 200, headers: { "content-type": "image/png", "content-length": String(PNG.length) } });
      }) as typeof fetch,
      async (h) => hosts[h] ?? [],
    );
    const a = (await callDriver(as(user), "teaser.importUrl", { url: "https://img.example.com/house.png", credit: "“House” by Ana, CC BY 4.0" })) as { source: string; credit: string; name: string };
    expect(a).toMatchObject({ source: "web", credit: "“House” by Ana, CC BY 4.0", name: "house.png" });
    await expect(callDriver(as(user), "teaser.importUrl", { url: "http://internal.example.com/x.png" })).rejects.toThrow(/private/);
    await expect(callDriver(as(user), "teaser.importUrl", { url: "https://img.example.com/redirect" })).rejects.toThrow(/private/);
    await expect(callDriver(as(user), "teaser.importUrl", { url: "http://127.0.0.1/x.png" })).rejects.toThrow(/private/);
    await expect(callDriver(as(user), "teaser.importUrl", { url: "file:///etc/passwd" })).rejects.toThrow(/http/);
    await expect(callDriver(as(user), "teaser.importUrl", { url: "https://img.example.com/page.html" })).rejects.toThrow(/not a JPEG/);
  });

  it("searches Openverse and returns thumbnails inline with credits", async () => {
    setWebImpl(
      (async (url: string) => {
        if (url.startsWith("https://api.openverse.org/v1/images/?"))
          return Response.json({ result_count: 1, results: [{ id: "abc", title: "Modern house", creator: "Ana", license: "by", license_version: "4.0", url: "https://img.example.com/full.png", thumbnail: "https://api.openverse.org/v1/images/abc/thumb/", foreign_landing_url: "https://flickr.com/x", width: 1600, height: 1000 }] });
        return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
      }) as typeof fetch,
      async () => ["151.101.1.69"],
    );
    const r = (await callDriver(as(user), "teaser.searchWeb", { q: "modern house" })) as { results: { thumb: string; credit: string }[] };
    expect(r.results).toHaveLength(1);
    expect(r.results[0]!.thumb).toMatch(/^data:image\/png;base64,/);
    expect(r.results[0]!.credit).toBe("“Modern house” by Ana, BY 4.0 (via Openverse)");
  });
});

describe("Polish with AI", () => {
  it("needs the person's own key", async () => {
    await expect(callDriver(as(user), "teaser.polish", { text: "Nice condo in BGC" })).rejects.toMatchObject({ code: "provider_not_configured" });
  });
  it("uses the saved key, returns structured copy and meters it", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ choices: [{ message: { role: "assistant", content: '```json\n{"taglines":["Live above BGC"],"short":"A bright 2BR.","long":"A bright 2BR unit.","highlights":["City views"]}\n```' }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 40, cost: 0.0002 } }),
    );
    await callDriver(as(user, app("settings")), "ai.keys.save", { provider: "openrouter", apiKey: "sk-or-v1-test-test-test-1234" });
    const r = await callDriver(as(user), "teaser.polish", { text: "2BR condo in BGC with city views" });
    expect(r).toMatchObject({ taglines: ["Live above BGC"], short: "A bright 2BR.", highlights: ["City views"], provider: "OpenRouter · gpt-4o" });
    const usage = (await callDriver(as(user, app("settings")), "usage.mine", {})) as { today: { turns: number } };
    expect(usage.today.turns).toBe(1);
  });
});
