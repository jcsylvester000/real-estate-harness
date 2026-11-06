/**
 * A local stand-in for an OpenAI-compatible AI service and a SearXNG search service, so browser tests can run
 * the Research and Agent harnesses end to end with no network. The "model" follows a fixed, sensible script.
 */
import http from "node:http";

type Msg = { role: string; content?: string | null; name?: string };
type Body = { messages: Msg[]; tools?: { function: { name: string } }[]; tool_choice?: string };

const PAGES: Record<string, string> = {
  "/bir/rdo-43": `<html><head><title>Zonal Values – RDO No. 43 (Pasig City)</title><meta property="article:published_time" content="2025-08-01"></head><body><main><h1>Zonal Values, RDO No. 43</h1><p>Department Order No. 018-2025, effective 1 August 2025.</p><table><tr><td>San Antonio</td><td>Ortigas Avenue</td><td>CR</td><td>350,000</td></tr><tr><td>San Antonio</td><td>Ortigas Avenue</td><td>RR</td><td>210,000</td></tr></table></main></body></html>`,
  "/dof/rpvara": `<html><head><title>RA 12001 transition: zonal values remain</title><meta property="article:published_time" content="2026-05-05"></head><body><article><p>Existing zonal values remain in effect while revisions are suspended. Full rollout of market values is targeted for 2028.</p></article></body></html>`,
};

let n = 0;
const reply = (msg: object, finish = "stop") => JSON.stringify({ id: `c${++n}`, choices: [{ index: 0, message: msg, finish_reason: finish }], usage: { prompt_tokens: 900, completion_tokens: 120, cost: 0.0004 } });
const call = (name: string, args: object) => reply({ role: "assistant", content: null, tool_calls: [{ id: `t${++n}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, "tool_calls");
const text = (t: string) => reply({ role: "assistant", content: t });

function model(b: Body): string {
  const tools = (b.tools ?? []).map((t) => t.function.name);
  const user = [...b.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const toolMsgs = b.messages.slice(b.messages.lastIndexOf(b.messages.filter((m) => m.role === "user").at(-1)!)).filter((m) => m.role === "tool");
  const results = toolMsgs.map((m) => JSON.parse(m.content ?? "{}"));
  // Key test: a plain "say OK" check and a tool check.
  if (tools.includes("compute_payment")) return toolMsgs.length ? text("OK") : call("compute_payment", { principal: 1000000, annualRatePct: 6, years: 20 });
  if (!tools.length || /reply with ok/i.test(user)) return text("OK");
  if (tools.includes("web_search")) {
    if (b.tool_choice === "none" || toolMsgs.length >= 3) return text("Answer from the sources found [S1].");
    if (!toolMsgs.length) return call("find_zonal_value", { place: "San Antonio, Pasig City", street: "Ortigas Avenue" });
    if (toolMsgs.length === 1) {
      const hit = (results[0].results ?? [])[0];
      return call("read_source", { source: hit?.id ?? "S1", question: "RR zonal value Ortigas Avenue" });
    }
    const ids = results.flatMap((r) => (r.results ?? []).map((x: { id: string }) => x.id).concat(r.id ? [r.id] : []));
    const bir = results[1]?.id ?? ids[0];
    const ctx = String(results[0]?.context ?? "").match(/\[(S\d+)\]/)?.[1] ?? "S1";
    return text(`**₱210,000 per sqm** is the BIR zonal value for residential (RR) lots on Ortigas Avenue, Barangay San Antonio, Pasig City [${bir}].\n\n| Item | Value |\n|---|---|\n| Classification | RR (residential) |\n| RDO | No. 43, Pasig City |\n| Department Order | No. 018-2025, effective 1 August 2025 [${bir}] |\n| Commercial (CR) on the same street | ₱350,000 per sqm [${bir}] |\n\nZonal values stay in force while the BIR has paused revisions ahead of RA 12001's market values (target 2028) [${ctx}].\n\n**What to verify:** the exact lot classification on the tax declaration, and request a Certificate of Zonal Value from RDO 43 for the CAR.`);
  }
  if (tools.includes("app_listings_ask")) {
    if (b.tool_choice === "none" || toolMsgs.length >= 3) return text("Done.");
    if (!toolMsgs.length) return call("app_listings_ask", { text: /merville/i.test(user) ? "house in Merville" : user.slice(0, 200) });
    const first = results[0]?.result?.listings?.[0];
    if (toolMsgs.length === 1 && first) {
      if (/presentation|teaser|deck/i.test(user)) return call("app_make_teaser", { kind: "deck", listing_code: first.code });
      return call("app_open", { app: "property-finder", label: `Open ${first.code} in Property Finder`, query: first.code });
    }
    const made = results[1];
    if (made?.created) return text(`I found **${first.name}** (${first.code}, ₱${Number(first.price).toLocaleString("en-PH")}) and made a presentation, “${made.title}”, with ${made.slides} slides. Add photos in Property Teaser before exporting.`);
    return text(first ? `The best match is **${first.name}** (${first.code}).` : "No listing matched.");
  }
  return text("OK");
}

export function startStub(port: number) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (req.method === "POST" && url.pathname.endsWith("/chat/completions")) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(model(JSON.parse(raw)));
      });
      return;
    }
    if (url.pathname === "/search") {
      const base = `http://127.0.0.1:${port}`;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ results: /zonal|rdo/i.test(url.searchParams.get("q") ?? "") ? [{ title: "Zonal Values – RDO No. 43 (Pasig City)", url: `${base}/bir/rdo-43`, content: "Department Order No. 018-2025" }, { title: "RA 12001 transition", url: `${base}/dof/rpvara`, content: "Zonal values remain in effect" }] : [] }));
      return;
    }
    const page = PAGES[url.pathname];
    res.writeHead(page ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    res.end(page ?? "not found");
  });
  return new Promise<http.Server>((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}
