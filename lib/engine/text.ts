/**
 * Text toolkit for the no-AI Query Engine: tokenizing (English, Filipino, Taglish), sentence splitting,
 * extractive summaries, fact extraction and passage answers. Pure functions, no I/O, no AI.
 */

/** Words that carry no meaning for matching. English + Filipino + common Taglish fillers. */
export const STOPWORDS = new Set(
  (
    "a an the and or but if then so of to in on at by for with from as is are was were be been being am do does did have has had i me my we our you your he she it its they them their this that these those there here what which who whom how when where why can could would should will shall may might must not no yes " +
    "please pls po ho naman lang nga ba pa na ng sa ang mga si ni kay kina ako ko akin ikaw ka mo iyo siya niya kami tayo kayo sila nila natin namin ninyo ito iyan iyon yan yun yung dito diyan doon may meron wala hindi oo opo eh kasi kaya pero tapos din rin daw raw lamang talaga sana " +
    "just also really very some any all more most other such only own same than too about into over after before again further once up down out off"
  ).split(" "),
);

/** Lowercase, strip accents and punctuation (keeps ₱, %, digits, # and hyphenated codes). */
export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”"‘’'`]/g, "")
    .replace(/[^a-z0-9₱%#\s.-]/g, " ")
    .replace(/(?<!\d)[.-]|[.-](?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Light stemmer: English plurals and -ing/-ed, Filipino "mag-/nag-/pag-" prefixes and reduplication. */
export function stem(w: string) {
  let x = w;
  if (x.length > 5) x = x.replace(/^(mag|nag|pag|ipag|maki|naki|pinag|ika)-?/, "");
  if (x.length > 4) x = x.replace(/^(\w{2,3})\1/, "$1"); // babayaran -> bayaran
  if (x.length > 5) x = x.replace(/(ings?|edly|ed|es)$/, "");
  else if (x.length > 3) x = x.replace(/s$/, "");
  if (x.length > 5) x = x.replace(/(an|in|han|hin)$/, "");
  return x;
}

export function tokens(s: string, { keepStop = false } = {}) {
  return normalize(s)
    .split(" ")
    .filter((w) => w && (keepStop || !STOPWORDS.has(w)))
    .map(stem);
}

/** Sentences, keeping list items and short heading lines as their own units. */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n{2,}|\n(?=\s*(?:[-*•]|\d+[.)])\s)/)) {
    const flat = block.replace(/\s*\n\s*/g, " ").trim();
    if (!flat) continue;
    // Split on sentence ends, not on "Mr." "Inc." "No." or decimals.
    const parts = flat.split(/(?<!\b(?:mr|mrs|ms|dr|atty|engr|inc|corp|co|no|nos|sq|approx|vs|st|ave|blk|lot|ph|p)\.)(?<=[.!?])\s+(?=[A-Z0-9₱“"(])/i);
    for (const p of parts) if (p.trim().length > 2) out.push(p.trim());
  }
  return out;
}

/** Splits text into passages of about `size` characters on paragraph, then sentence, boundaries. */
export function chunk(text: string, size = 900): string[] {
  const paras = text.replace(/\r/g, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const p of paras) {
    if (p.length > size) {
      push();
      let buf = "";
      for (const s of sentences(p)) {
        if (buf && buf.length + s.length > size) {
          out.push(buf.trim());
          buf = "";
        }
        buf += (buf ? " " : "") + s;
      }
      if (buf) cur = buf;
      continue;
    }
    if (cur && cur.length + p.length > size) push();
    cur += (cur ? "\n\n" : "") + p;
  }
  push();
  return out;
}

/** Term-frequency vector. */
const tf = (ts: string[]) => {
  const m = new Map<string, number>();
  for (const t of ts) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
};

const MONEY = /(?:₱|php|p)\s?\d[\d,]*(?:\.\d+)?\s*(?:m(?:illion)?|k)?\b|\b\d[\d,]*(?:\.\d+)?\s*(?:million|pesos)\b/gi;
const DATE =
  /\b(?:\d{1,2}\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi;
const AREA = /\b\d[\d,]*(?:\.\d+)?\s*(?:sq\.?\s*m(?:eters?)?|sqm|square\s+met(?:er|re)s?|m2|hectares?|has?\.)(?=\W|$)/gi;
const PERCENT = /\b\d+(?:\.\d+)?\s*%/g;
const TITLE_NO = /\b(?:TCT|OCT|CCT)\s*(?:no\.?|number|#)?\s*[A-Z0-9-]{3,}/gi;
const ACTION = /\b(must|shall|should|deadline|due|on or before|not later than|kailangan|dapat|bayaran|pay|submit|sign|follow up|follow-up|call|send|schedule|todo|to do|next step|action)\b/i;

const uniq = (xs: string[], max = 12) => [...new Set(xs.map((x) => x.replace(/\s+/g, " ").trim().replace(/[,.;:]+$/, "")))].slice(0, max);

export interface DocFacts {
  amounts: string[];
  dates: string[];
  areas: string[];
  percents: string[];
  titles: string[];
  /** Sentences that read like obligations, deadlines or to-dos. */
  actions: string[];
  /** Most distinctive words in the document. */
  keywords: string[];
}

export function extractFacts(text: string): DocFacts {
  const sents = sentences(text);
  const counts = tf(tokens(text).filter((w) => w.length > 3 && !/^\d/.test(w)));
  const keywords = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
  return {
    amounts: uniq(text.match(MONEY) ?? []),
    dates: uniq(text.match(DATE) ?? []),
    areas: uniq(text.match(AREA) ?? []),
    percents: uniq(text.match(PERCENT) ?? [], 8),
    titles: uniq(text.match(TITLE_NO) ?? [], 6),
    actions: uniq(sents.filter((s) => ACTION.test(s) && s.length < 260), 8),
    keywords,
  };
}

/**
 * Extractive summary: scores each sentence by how central its words are to the document (TF-IDF centroid),
 * with a boost for figures, dates and action words and a small boost for early position. Returns the best
 * sentences in their original order.
 */
export function summarize(text: string, maxSentences = 5): string[] {
  const sents = sentences(text).filter((s) => s.length >= 25 && s.length <= 400);
  if (sents.length <= maxSentences) return sents;
  const docs = sents.map((s) => tf(tokens(s)));
  const df = new Map<string, number>();
  for (const d of docs) for (const w of d.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log(1 + sents.length / (df.get(w) ?? 1));
  const centroid = new Map<string, number>();
  for (const d of docs) for (const [w, c] of d) centroid.set(w, (centroid.get(w) ?? 0) + c * idf(w));
  const scored = sents.map((s, i) => {
    const d = docs[i]!;
    let score = 0;
    let len = 0;
    for (const [w, c] of d) {
      score += c * idf(w) * (centroid.get(w) ?? 0);
      len += c;
    }
    score = len ? score / Math.sqrt(len) : 0;
    if (MONEY.test(s) || DATE.test(s)) score *= 1.3;
    MONEY.lastIndex = DATE.lastIndex = 0;
    if (ACTION.test(s)) score *= 1.15;
    score *= 1 + 0.25 * (1 - i / sents.length);
    return { i, s, score };
  });
  // Pick top sentences, skipping near-duplicates.
  const picked: typeof scored = [];
  for (const c of [...scored].sort((a, b) => b.score - a.score)) {
    if (picked.length >= maxSentences) break;
    const ct = new Set(tokens(c.s));
    const dup = picked.some((p) => {
      const pt = new Set(tokens(p.s));
      const inter = [...ct].filter((w) => pt.has(w)).length;
      return inter / Math.max(1, Math.min(ct.size, pt.size)) > 0.7;
    });
    if (!dup) picked.push(c);
  }
  return picked.sort((a, b) => a.i - b.i).map((p) => p.s);
}

/** The sentences in `passages` that best answer `question` (keyword overlap weighted by rarity). */
export function bestSentences(question: string, passages: { text: string; ref: string }[], max = 3) {
  const q = new Set(tokens(question).filter((w) => w.length > 1));
  if (!q.size) return [];
  const all = passages.flatMap((p) => sentences(p.text).map((s) => ({ s, ref: p.ref })));
  const df = new Map<string, number>();
  for (const { s } of all) for (const w of new Set(tokens(s))) df.set(w, (df.get(w) ?? 0) + 1);
  const scored = all.map(({ s, ref }) => {
    const ws = new Set(tokens(s));
    let score = 0;
    for (const w of q) if (ws.has(w)) score += Math.log(1 + all.length / (df.get(w) ?? 1));
    // Questions about money, dates or size favour sentences that contain one.
    if (/\b(how much|magkano|price|presyo|amount|cost|bayad|halaga)\b/i.test(question) && /\d/.test(s) && /₱|php|peso|million/i.test(s)) score *= 1.5;
    if (/\b(when|kailan|date|deadline|petsa)\b/i.test(question) && DATE.test(s)) score *= 1.5;
    DATE.lastIndex = 0;
    return { s, ref, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

/** Cosine similarity of two token lists. */
export function cosine(a: string[], b: string[]) {
  const A = tf(a);
  const B = tf(b);
  let dot = 0;
  for (const [w, c] of A) dot += c * (B.get(w) ?? 0);
  const n = (m: Map<string, number>) => Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0));
  return dot ? dot / (n(A) * n(B)) : 0;
}
