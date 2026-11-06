/**
 * Safe server-side fetching for research: http(s) only, no credentials in links, public addresses only
 * (re-checked on every redirect), size and time limits. Tests swap the network with setResearchNet().
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateAddress } from "@/lib/server/services/teasers";

type Fetcher = typeof fetch;
let fetcher: Fetcher = (...a) => fetch(...a);
let resolver = async (host: string) => (await lookup(host, { all: true })).map((r) => r.address);
/** Lets a local test server be read (end-to-end tests only; never set this on a real deployment). */
const allowPrivate = () => process.env.RESEARCH_ALLOW_PRIVATE_NETWORK === "true";

export function setResearchNet(f: Fetcher, r?: (host: string) => Promise<string[]>) {
  fetcher = f;
  if (r) resolver = r;
}

export class FetchError extends Error {}
export const UA = "GridAgentic-Research/1.0 (+real estate research assistant)";

export interface Fetched {
  body: Buffer;
  type: string;
  url: string;
  status: number;
}

export async function safeFetch(rawUrl: string, opts: { maxBytes?: number; timeoutMs?: number; accept?: string; headers?: Record<string, string>; method?: string; body?: string } = {}): Promise<Fetched> {
  const maxBytes = opts.maxBytes ?? 4_000_000;
  let url = rawUrl;
  const deadline = Date.now() + (opts.timeoutMs ?? 9000);
  for (let hop = 0; hop < 5; hop++) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new FetchError("Not a valid link.");
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new FetchError("Only http and https links can be read.");
    if (u.username || u.password) throw new FetchError("Links with a user name or password are not allowed.");
    const host = u.hostname.replace(/^\[|\]$/g, "");
    const addrs = isIP(host) ? [host] : await resolver(host).catch(() => []);
    if (!addrs.length) throw new FetchError(`${host} could not be found.`);
    if (!allowPrivate() && addrs.some(isPrivateAddress)) throw new FetchError("Private or local network addresses are not allowed.");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(500, deadline - Date.now()));
    try {
      const res = await fetcher(u.toString(), {
        method: opts.method ?? "GET",
        body: opts.body,
        redirect: "manual",
        signal: ctrl.signal,
        headers: { accept: opts.accept ?? "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5", "user-agent": UA, "accept-language": "en-PH,en;q=0.9,fil;q=0.5", ...opts.headers },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location")!, u).toString();
        continue;
      }
      if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new FetchError(`The page is too large (over ${Math.round(maxBytes / 1e6)} MB).`);
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (reader)
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > maxBytes) {
            ctrl.abort();
            throw new FetchError(`The page is too large (over ${Math.round(maxBytes / 1e6)} MB).`);
          }
          chunks.push(value);
        }
      return { body: Buffer.concat(chunks), type: res.headers.get("content-type") ?? "", url: u.toString(), status: res.status };
    } catch (e) {
      if (e instanceof FetchError) throw e;
      throw new FetchError(ctrl.signal.aborted ? "The site took too long to answer." : "The site did not answer.");
    } finally {
      clearTimeout(timer);
    }
  }
  throw new FetchError("Too many redirects.");
}
