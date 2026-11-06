import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BUILTIN_APPS, type AppInfo } from "@/lib/apps/catalog";
import { importGridCsv } from "@/lib/listings/import";
import { setResearchNet } from "@/lib/research/fetch";
import { callDriver, type Actor } from "@/lib/server/drivers";
import { createUser, type PublicUser } from "@/lib/server/services/auth";
import { freshDb } from "../helpers/db";
import { freshListingsDb } from "../helpers/listings-db";

let user: PublicUser;
let keyId = "";
const app = (id: string) => BUILTIN_APPS.find((a) => a.id === id)!;
const as = (a: AppInfo): Actor => ({ user, sessionId: "t", app: a });

type Msg = { role: string; content?: string; tool_calls?: unknown[]; name?: string };
type Body = { messages: Msg[]; tools?: { function: { name: string } }[]; tool_choice?: string };
/** A scripted OpenAI-compatible model: each step looks at the conversation and answers. */
let script: (body: Body, step: number) => { text?: string; calls?: { name: string; args: Record<string, unknown> }[] };
const bodies: Body[] = [];

const DDG = (hits: [string, string, string][]) =>
  `<html><body>${hits.map(([u, t, s]) => `<div class="result results_links web-result"><h2><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(u)}&amp;rut=x">${t}</a></h2><a class="result__snippet" href="#">${s}</a></div>`).join("")}</body></html>`;
const BIR_PAGE = `<html><head><title>Zonal Values RDO No. 43 – Pasig</title><meta property="article:published_time" content="2025-08-01"></head><body><nav>Home Menu</nav><main><h1>Zonal Values</h1><p>Department Order No. 018-2025, effective 1 August 2025.</p><table><tr><td>San Antonio</td><td>Ortigas Avenue</td><td>CR</td><td>₱ 350,000</td></tr><tr><td>San Antonio</td><td>Ortigas Avenue</td><td>RR</td><td>₱ 210,000</td></tr></table></main><footer>© BIR</footer></body></html>`;

function stubNet() {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    if (u.startsWith("https://llm.test/")) {
      const body = JSON.parse(String(init.body)) as Body;
      bodies.push(body);
      const r = script(body, bodies.length);
      const msg = r.calls?.length
        ? { role: "assistant", content: r.text ?? null, tool_calls: r.calls.map((c, i) => ({ id: `call_${bodies.length}_${i}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) }
        : { role: "assistant", content: r.text ?? "" };
      return new Response(JSON.stringify({ choices: [{ message: msg, finish_reason: r.calls?.length ? "tool_calls" : "stop" }], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.startsWith("https://html.duckduckgo.com/")) {
      const q = decodeURIComponent(String(init.body).replace(/\+/g, " "));
      if (/zonal/i.test(q))
        return new Response(DDG([["https://www.bir.gov.ph/zonal-values/rdo-43", "Zonal Values RDO 43 Pasig", "Department Order 018-2025"], ["https://www.housal.com/find-zonal-value/city/city-of-pasig", "BIR Zonal Values in Pasig", "Search streets"]]), { headers: { "content-type": "text/html" } });
      return new Response(DDG([]), { headers: { "content-type": "text/html" } });
    }
    if (u === "https://www.bir.gov.ph/zonal-values/rdo-43") return new Response(BIR_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (u.endsWith(".pdf")) return new Response(readFileSync(path.join(process.cwd(), "tests/fixtures/sample-lease.pdf")), { headers: { "content-type": "application/pdf" } });
    return new Response("not found", { status: 404 });
  });
  setResearchNet((...a) => fetch(...a), async () => ["93.184.216.34"]);
}

const lastTool = (b: Body) => JSON.parse([...b.messages].reverse().find((m) => m.role === "tool")!.content!) as Record<string, unknown>;

beforeAll(async () => {
  process.env.APP_SECRET ||= "test-secret-test-secret-test-secret-123";
  process.env.HARNESS_DEMO_PROVIDER = "true";
  await freshDb();
  await freshListingsDb();
  await importGridCsv({ fileName: "sample.csv", csv: readFileSync(path.join(process.cwd(), "tests/fixtures/grid-listings-sample.csv"), "utf8") });
  user = await createUser({ username: "researcher", password: "a long pass phrase 123", role: "broker" });
  stubNet();
  script = () => ({ text: "OK" });
  const k = (await callDriver(as(app("deal-desk")), "ai.keys.save", { provider: "custom", apiKey: "sk-test-0000000000000000", model: "test-model", baseUrl: "https://llm.test/v1", name: "Test AI" })) as { id: string };
  keyId = k.id;
});
afterEach(() => {
  bodies.length = 0;
});

describe("Research and Agent need an AI key", () => {
  it("refuses research on the Query Engine", async () => {
    await expect(callDriver(as(app("deal-desk")), "ai.chat", { message: "zonal value Pasig", mode: "research" })).rejects.toMatchObject({ code: "ai_key_required" });
  });
});

describe("Research harness", () => {
  it("researches with tools, reads the official page, and returns checked sources", async () => {
    stubNet();
    let birId = "";
    script = (b, step) => {
      if (step === 1) return { calls: [{ name: "ph_research_brief", args: { topic: "zonal_values" } }, { name: "find_zonal_value", args: { place: "San Antonio, Pasig City", street: "Ortigas Avenue" } }] };
      if (step === 2) {
        const r = lastTool(b) as { results: { id: string; url: string }[] };
        birId = r.results.find((x) => x.url.includes("bir.gov.ph"))!.id;
        return { calls: [{ name: "read_source", args: { source: birId, question: "Ortigas Avenue San Antonio RR value" } }] };
      }
      const read = lastTool(b) as { text: string; publisher: string; page_date: string };
      expect(read.text).toContain("Department Order No. 018-2025");
      expect(read.text).not.toContain("Home Menu");
      expect(read.publisher).toBe("Bureau of Internal Revenue (BIR)");
      expect(read.page_date).toBe("2025-08-01");
      return { text: `The residential (RR) zonal value on Ortigas Avenue, San Antonio, Pasig is ₱210,000 per sqm under Department Order No. 018-2025 [${birId}]. Zonal values stay in force until RA 12001 market values take over [S1]. Also see [S99] and https://made-up.example/zv.` };
    };
    const turn = (await callDriver(as(app("deal-desk")), "ai.chat", { message: "Zonal value of a lot on Ortigas Ave, San Antonio, Pasig?", provider: `mine:${keyId}`, mode: "research" })) as {
      mode: string;
      reply: string;
      sources: { id: string; url: string; tier: string; cited: boolean; via: string }[];
      warnings: string[];
      toolTrace: { name: string }[];
      sessionId: string;
    };
    expect(turn.mode).toBe("research");
    expect(turn.toolTrace.map((t) => t.name)).toEqual(["ph_research_brief", "find_zonal_value", "read_source"]);
    // The research prompt and tools went to the model; app tools did not.
    const names = bodies[0]!.tools!.map((t) => t.function.name);
    expect(names).toEqual(expect.arrayContaining(["web_search", "read_source", "find_zonal_value", "compute_acquisition_costs"]));
    expect(names.some((n) => n.startsWith("app_"))).toBe(false);
    expect(bodies[0]!.messages[0]!.content).toMatch(/Research desk/);
    const bir = turn.sources.find((x) => x.id === birId)!;
    expect(bir).toMatchObject({ tier: "official", cited: true, via: "read" });
    expect(turn.sources.find((x) => x.id === "S1")).toMatchObject({ cited: true, via: "brief" });
    expect(turn.warnings.join(" ")).toMatch(/S99.*unverified/);
    expect(turn.warnings.join(" ")).toMatch(/made-up\.example/);

    // A follow-up can cite the same sources: the ledger is kept per conversation.
    script = () => ({ text: `As above, ₱210,000 per sqm [${birId}].` });
    const next = (await callDriver(as(app("deal-desk")), "ai.chat", { message: "Repeat the value", sessionId: turn.sessionId, provider: `mine:${keyId}`, mode: "research" })) as { sources: { id: string }[]; warnings: string[] };
    expect(next.sources.map((x) => x.id)).toEqual([birId]);
    expect(next.warnings).toEqual([]);
  });

  it("answers from what it found when the step limit is reached", async () => {
    stubNet();
    process.env.RESEARCH_MAX_TOOL_STEPS = "2";
    script = (b) => (b.tool_choice === "none" ? { text: "Short answer from the brief [S1]." } : { calls: [{ name: "ph_research_brief", args: { topic: "sale_taxes" } }] });
    const turn = (await callDriver(as(app("deal-desk")), "ai.chat", { message: "Taxes on selling a lot?", provider: `mine:${keyId}`, mode: "research" })) as { reply: string; warnings: string[] };
    delete process.env.RESEARCH_MAX_TOOL_STEPS;
    expect(turn.reply).toBe("Short answer from the brief [S1].");
    expect(bodies.at(-1)!.tool_choice).toBe("none");
    expect(turn.warnings.join(" ")).toMatch(/maximum tool steps/);
  });
});

describe("Agent harness", () => {
  it("uses Grid's apps through the driver gate, without uploader details, and offers an Open button", async () => {
    stubNet();
    let code = "";
    script = (b, step) => {
      if (step === 1) return { calls: [{ name: "app_listings_ask", args: { text: "house in Merville" } }] };
      if (step === 2) {
        const r = lastTool(b) as { result: { listings: { code: string }[] } };
        code = r.result.listings[0]!.code;
        expect(JSON.stringify(r)).not.toMatch(/listedBy|@/);
        return { calls: [{ name: "app_make_teaser", args: { kind: "deck", listing_code: code } }, { name: "app_file_write", args: { path: "/Notes/Merville brief.md", content: "# Merville\nShortlist" } }] };
      }
      return { text: `Made a presentation for ${code} and saved a note.` };
    };
    const turn = (await callDriver(as(app("deal-desk")), "ai.chat", { message: "Find the Merville house, make a presentation and save a note", provider: `mine:${keyId}`, mode: "agent" })) as {
      mode: string;
      actions: { app: string; args: Record<string, unknown> }[];
      toolTrace: { name: string; result: Record<string, unknown> }[];
    };
    expect(turn.mode).toBe("agent");
    const tools = bodies[0]!.tools!.map((t) => t.function.name);
    expect(tools).toEqual(expect.arrayContaining(["app_listings_ask", "app_match_buyer", "app_make_teaser", "app_file_write", "app_open", "compute_acquisition_costs"]));
    expect(tools).not.toContain("web_search");
    expect(bodies[0]!.messages[0]!.content).toMatch(/Working in Grid/);
    const made = turn.toolTrace.find((t) => t.name === "app_make_teaser")!.result as { created: boolean; id: string };
    expect(made.created).toBe(true);
    expect(turn.actions).toEqual(expect.arrayContaining([expect.objectContaining({ app: "property-teaser", args: { project: made.id } }), expect.objectContaining({ app: "files", args: { path: "/Notes" } })]));
    const project = (await callDriver(as(app("property-teaser")), "teaser.get", { id: made.id })) as { data: { property: { listingCode: string } } };
    expect(project.data.property.listingCode).toBe(code);
    const note = (await callDriver(as(app("notes")), "fs.read", { path: "/Notes/Merville brief.md" })) as { content: string };
    expect(note.content).toContain("Shortlist");
  });

  it("offers only the tools the app is allowed to use", async () => {
    stubNet();
    script = () => ({ text: "OK" });
    // Property Teaser may use listings, files and teasers, but not buyers or documents.
    await callDriver(as(app("property-teaser")), "ai.chat", { message: "hi", provider: `mine:${keyId}`, mode: "agent" });
    const tools = bodies[0]!.tools!.map((t) => t.function.name);
    expect(tools).toEqual(expect.arrayContaining(["app_listings_ask", "app_make_teaser", "app_file_write"]));
    expect(tools).not.toContain("app_saved_buyers");
    expect(tools).not.toContain("app_search_documents");
  });
});
