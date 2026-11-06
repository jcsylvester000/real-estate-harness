import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { forModel, toToolParams } from "@/lib/agent/app-tools";
import { RealEstateHarness, ToolRegistry, type ModelProvider, type ModelRequest } from "@/lib/harness";
import { BRIEFS } from "@/lib/research/briefs";
import { SourceLedger } from "@/lib/research/ledger";
import { htmlToText, passages, pdfToText } from "@/lib/research/page";
import { parseDuckDuckGo } from "@/lib/research/search";
import { publisherOf, sitesFor } from "@/lib/research/sources";

describe("reading pages", () => {
  it("keeps the article, drops navigation and scripts, and finds the title and date", () => {
    const p = htmlToText(`<html><head><title>X</title><meta property="og:title" content="BIR issues RMC 75-2026"><meta property="og:site_name" content="BusinessWorld"><meta property="article:published_time" content="2026-07-10T08:00:00+08:00"></head><body><nav>Menu Login</nav><script>var a=1</script><article><h1>Heading</h1><p>The BIR issued RMC No. 75-2026 &amp; FAQs.</p><ul><li>One</li><li>Two</li></ul></article><footer>Copyright</footer></body></html>`);
    expect(p).toMatchObject({ title: "BIR issues RMC 75-2026", siteName: "BusinessWorld", published: "2026-07-10" });
    expect(p.text).toContain("RMC No. 75-2026 & FAQs.");
    expect(p.text).toContain("- One");
    expect(p.text).not.toMatch(/Menu Login|var a|Copyright/);
  });
  it("reads PDFs", async () => {
    const p = await pdfToText(readFileSync(path.join(process.cwd(), "tests/fixtures/sample-lease.pdf")));
    expect(p.text).toContain("LEASE CONTRACT");
    expect(p.text).toContain("[Page 1]");
  });
  it("picks the passages that answer the question", () => {
    const filler = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} about unrelated corporate history and leadership.`).join("\n\n");
    const text = `${filler}\n\nThe documentary stamp tax is 1.5% of the higher of the selling price or zonal value.\n\n${filler}`;
    const r = passages(text, "documentary stamp tax rate", 600);
    expect(r.truncated).toBe(true);
    expect(r.text).toContain("1.5% of the higher");
    expect(r.text.length).toBeLessThanOrEqual(700);
  });
});

describe("sources", () => {
  it("knows how far to trust a publisher", () => {
    expect(publisherOf("https://www.bir.gov.ph/x").tier).toBe("official");
    expect(publisherOf("https://pasigcity.gov.ph/assessor").tier).toBe("official");
    expect(publisherOf("https://www.colliers.com/en-ph/research").tier).toBe("research");
    expect(publisherOf("https://www.housal.com/find-zonal-value").tier).toBe("portal");
    expect(publisherOf("https://randomblog.example").tier).toBe("other");
    expect(sitesFor("zonal", ["official"])[0]).toBe("bir.gov.ph");
  });
  it("every brief point cites a source that exists", () => {
    for (const b of BRIEFS) for (const p of b.points) for (const i of p.src) expect(b.sources[i], `${b.id}: ${p.text}`).toBeDefined();
  });
  it("parses DuckDuckGo results", () => {
    const hits = parseDuckDuckGo(`<div class="result results_links"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.bir.gov.ph%2Fzv&amp;rut=1">Zonal <b>Values</b></a><a class="result__snippet">RDO 43 &amp; more</a></div><div class="result"><a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Ad</a></div>`);
    expect(hits).toEqual([{ title: "Zonal Values", url: "https://www.bir.gov.ph/zv", snippet: "RDO 43 & more" }]);
  });
});

describe("source ledger", () => {
  it("numbers sources once, upgrades a search hit that was read, and checks citations and links", () => {
    const l = new SourceLedger();
    const a = l.add({ url: "https://www.bir.gov.ph/zv?utm_source=x", title: "ZV", published: null, via: "search" });
    const b = l.add({ url: "https://bir.gov.ph/zv", title: "Zonal values", published: "2025-08-01", via: "read" });
    expect(b.id).toBe(a.id);
    expect(b.via).toBe("read");
    l.add({ url: "https://www.colliers.com/r", title: "Report", published: null, via: "read" });
    const c = l.check("Value is ₱210,000 [S1]. Missing [S7]. See https://bir.gov.ph/zv and https://fake.example/x.");
    expect(c.cited.map((x) => x.id)).toEqual(["S1"]);
    expect(c.consulted.map((x) => x.id)).toEqual(["S2"]);
    expect(c.unknownCitations).toEqual(["S7"]);
    expect(c.unverifiedLinks).toEqual(["https://fake.example/x"]);
    expect(new SourceLedger(l.all).add({ url: "https://x.example", title: "", published: null, via: "search" }).id).toBe("S3");
  });
});

describe("app tools", () => {
  it("turn app schemas into tool schemas every provider accepts", () => {
    const s = toToolParams(z.object({ text: z.string().min(1).max(300), limit: z.number().int().optional(), sort: z.enum(["a", "b"]).default("a"), crit: z.object({ place: z.string().nullable() }) }));
    expect(s).toEqual({ type: "object", properties: { text: { type: "string" }, limit: { type: "integer" }, sort: { type: "string", enum: ["a", "b"] }, crit: { type: "object", properties: { place: { type: "string" } }, required: ["place"] } }, required: ["text", "crit"] });
  });
  it("never shows the model who uploaded a listing", () => {
    expect(forModel({ listings: [{ code: "A", listedBy: "Juan", listedByEmail: "j@x.ph", price: 1 }] })).toEqual({ listings: [{ code: "A", price: 1 }] });
  });
});

describe("harness limits", () => {
  it("runs a step's tool calls together and answers within the time budget", async () => {
    const started: number[] = [];
    const slow = { definition: { name: "slow", description: "", parameters: { type: "object" as const, properties: {} } }, run: async () => (started.push(Date.now()), await new Promise((r) => setTimeout(r, 150)), { ok: 1 }) };
    const reqs: ModelRequest[] = [];
    const provider: ModelProvider = {
      id: "openai",
      model: "m",
      complete: async (req) => {
        reqs.push(req);
        const n = reqs.length;
        if (req.toolChoice === "none") return { text: "Final from what I have.", toolCalls: [], stopReason: "end", usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } };
        return { text: "", toolCalls: [{ id: `a${n}`, name: "slow", arguments: {} }, { id: `b${n}`, name: "slow", arguments: {} }], stopReason: "tool_use", usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } };
      },
    };
    const h = new RealEstateHarness({ tools: new ToolRegistry([slow]), system: "S", deadlineMs: 12_100, maxToolSteps: 5 });
    const t0 = Date.now();
    const r = await h.chat(provider, "go");
    expect(Math.abs(started[0]! - started[1]!)).toBeLessThan(50);
    expect(r.reply).toBe("Final from what I have.");
    expect(reqs[0]!.system).toBe("S");
    expect(r.warnings.join(" ")).toMatch(/time limit/);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
