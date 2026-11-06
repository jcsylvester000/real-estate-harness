/**
 * Turns a fetched page into readable text plus metadata (title, publisher, date), and picks the passages
 * that matter for a question, so a model reads ~1,500 words instead of a whole website.
 */
import type { Fetched } from "./fetch";

export interface PageText {
  title: string;
  siteName: string;
  published: string | null;
  description: string;
  text: string;
  kind: "html" | "pdf" | "text";
  pages?: number;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", peso: "₱", ntilde: "ñ", Ntilde: "Ñ" };
export const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e] ?? m;
  });

const meta = (html: string, ...names: string[]) => {
  for (const n of names) {
    const re = new RegExp(`<meta[^>]+(?:name|property|itemprop)=["']${n}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    const c = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (c?.trim()) return decode(c.trim());
  }
  return "";
};

export function htmlToText(html: string): Omit<PageText, "kind"> {
  const title = decode(meta(html, "og:title", "twitter:title") || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")).replace(/\s+/g, " ").trim();
  const siteName = meta(html, "og:site_name", "application-name");
  const description = meta(html, "description", "og:description");
  const dateRaw = meta(html, "article:published_time", "datePublished", "pubdate", "date", "dc.date", "article:modified_time") || html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] || "";
  const published = /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? dateRaw.slice(0, 10) : null;
  let body = html.match(/<(main|article)[\s\S]*?<\/\1>/i)?.[0] ?? html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html;
  body = body
    .replace(/<(script|style|noscript|svg|template|iframe|form|button|select)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/?(p|div|section|li|tr|h[1-6]|table|ul|ol|dl|dt|dd|blockquote|pre|figure|figcaption)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decode(body)
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l, i, a) => l && !(l.length < 3 && a[i - 1] === l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return { title, siteName, published, description, text };
}

export async function pdfToText(buf: Buffer, maxPages = 30): Promise<Omit<PageText, "kind">> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useWorkerFetch: false, disableFontFace: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i);
    const t = await page.getTextContent();
    let line = "";
    const lines: string[] = [];
    let lastY: number | null = null;
    for (const it of t.items as { str?: string; transform?: number[]; hasEOL?: boolean }[]) {
      const y = it.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trim());
        line = "";
      }
      line += (it.str ?? "") + (it.hasEOL ? "\n" : " ");
      lastY = y;
    }
    lines.push(line.trim());
    out.push(`[Page ${i}]\n${lines.filter(Boolean).join("\n")}`);
  }
  const info = (await doc.getMetadata().catch(() => null))?.info as { Title?: string; CreationDate?: string } | undefined;
  const d = info?.CreationDate?.match(/D:(\d{4})(\d{2})(\d{2})/);
  const text = out.join("\n\n");
  return { title: info?.Title?.trim() || text.split("\n").find((l) => l.length > 12 && !l.startsWith("[Page"))?.slice(0, 140) || "PDF document", siteName: "", published: d ? `${d[1]}-${d[2]}-${d[3]}` : null, description: "", text, pages: doc.numPages } as Omit<PageText, "kind">;
}

export async function extract(f: Fetched): Promise<PageText> {
  const type = f.type.toLowerCase();
  const isPdf = type.includes("pdf") || f.body.subarray(0, 5).toString("latin1") === "%PDF-";
  if (isPdf) return { ...(await pdfToText(f.body)), kind: "pdf" };
  const raw = f.body.toString("utf8");
  if (type.includes("html") || /<html|<body|<!doctype html/i.test(raw.slice(0, 2000))) return { ...htmlToText(raw), kind: "html" };
  if (type.startsWith("text/") || type.includes("json") || type.includes("xml")) return { title: "", siteName: "", published: null, description: "", text: raw, kind: "text" };
  throw new Error(`This link is a ${type || "binary"} file, not a page or PDF.`);
}

const STOP = new Set("the a an of and or to in for on at by with from is are was were be as that this it its what how who when where which do does did can will shall may should about into per vs".split(" "));
const terms = (q: string) => [...new Set(q.toLowerCase().split(/[^a-z0-9₱%.]+/).filter((w) => w.length > 1 && !STOP.has(w)))];

/** The passages most relevant to `focus` (keyword overlap, numbers and peso amounts count extra), in page order. */
export function passages(text: string, focus: string, maxChars = 5000): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  const paras: string[] = [];
  for (const block of text.split(/\n{2,}|\n(?=\[Page \d+\])/)) {
    if (block.length <= 900) paras.push(block);
    else for (let i = 0; i < block.length; i += 800) paras.push(block.slice(i, i + 900));
  }
  const q = terms(focus);
  const scored = paras.map((p, i) => {
    const l = p.toLowerCase();
    let s = 0;
    for (const t of q) if (l.includes(t)) s += 2 + Math.min(3, l.split(t).length - 2);
    if (/₱|\bphp\b|\d+(\.\d+)?\s?%/i.test(p)) s += 1;
    if (i < 3) s += 0.5;
    return { i, p, s };
  });
  const pick = new Set<number>();
  let used = 0;
  for (const x of [...scored].sort((a, b) => b.s - a.s)) {
    if (used + x.p.length > maxChars) continue;
    pick.add(x.i);
    used += x.p.length + 5;
  }
  const kept = scored.filter((x) => pick.has(x.i));
  return { text: kept.map((x, k) => (k && kept[k - 1]!.i !== x.i - 1 ? "…\n" : "") + x.p).join("\n"), truncated: true };
}
