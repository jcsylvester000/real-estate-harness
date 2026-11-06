/**
 * Intent classifier: TF-IDF cosine similarity between the message and every example phrase in the lexicon,
 * plus a boost for each strong cue. Also uses character trigrams so typos ("sumarize", "mortage") still land.
 * Learns nothing at runtime; the index is built once from lexicon.ts.
 */
import { INTENTS, INTENT_IDS, type IntentId } from "./lexicon";
import { tokens } from "./text";

const grams = (w: string) => {
  const p = `#${w}#`;
  const out: string[] = [];
  for (let i = 0; i < p.length - 2; i++) out.push(`~${p.slice(i, i + 3)}`);
  return out;
};
/** Word stems plus trigrams (trigrams weigh less: they catch spelling slips). */
const features = (s: string) => {
  const ws = tokens(s);
  return { ws, all: [...ws, ...ws.filter((w) => w.length > 3).flatMap(grams)] };
};

interface Vec {
  intent: IntentId;
  w: Map<string, number>;
  norm: number;
}

let INDEX: { vecs: Vec[]; idf: Map<string, number> } | null = null;

function build() {
  const docs = INTENT_IDS.flatMap((intent) => INTENTS[intent].examples.map((e) => ({ intent, f: features(e).all })));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.f)) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = new Map<string, number>();
  for (const [t, c] of df) idf.set(t, Math.log(1 + docs.length / c) * (t.startsWith("~") ? 0.35 : 1));
  const vecs = docs.map(({ intent, f }) => {
    const w = new Map<string, number>();
    for (const t of f) w.set(t, (w.get(t) ?? 0) + (idf.get(t) ?? 0));
    return { intent, w, norm: Math.sqrt([...w.values()].reduce((s, v) => s + v * v, 0)) || 1 };
  });
  return { vecs, idf };
}

export interface Classification {
  intent: IntentId | null;
  confidence: number;
  ranked: { intent: IntentId; score: number }[];
}

export function classify(message: string): Classification {
  INDEX ??= build();
  const { all } = features(message);
  const q = new Map<string, number>();
  for (const t of all) q.set(t, (q.get(t) ?? 0) + (INDEX.idf.get(t) ?? 0));
  const qn = Math.sqrt([...q.values()].reduce((s, v) => s + v * v, 0)) || 1;
  const best = new Map<IntentId, number>();
  for (const v of INDEX.vecs) {
    let dot = 0;
    for (const [t, x] of q) dot += x * (v.w.get(t) ?? 0);
    const sim = dot / (qn * v.norm);
    if (sim > (best.get(v.intent) ?? 0)) best.set(v.intent, sim);
  }
  for (const id of INTENT_IDS) {
    const hits = INTENTS[id].cues.filter((re) => re.test(message)).length;
    if (hits) best.set(id, (best.get(id) ?? 0) + Math.min(0.5, 0.22 * hits));
  }
  const ranked = [...best.entries()].map(([intent, score]) => ({ intent, score: Math.round(score * 1000) / 1000 })).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  return { intent: top && top.score >= 0.2 ? top.intent : null, confidence: top?.score ?? 0, ranked: ranked.slice(0, 4) };
}
