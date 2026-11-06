"use client";
/**
 * Deal Desk "/" commands: pick a feature, then answer short follow-up questions (which listing, which lender,
 * which note…) by clicking or typing. Each finished flow becomes a plain sentence the Query Engine (or an AI)
 * understands, so a typed question and a picked one behave the same.
 *
 * Keyboard: ↑ ↓ to move, Enter or Tab to pick, Backspace on an empty box to go back a step, Esc to close.
 */
import {
  ArrowLeft,
  Building2,
  Calculator,
  ChevronRight,
  CornerDownLeft,
  FileText,
  Handshake,
  HelpCircle,
  Landmark,
  NotebookPen,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KINDS } from "@/lib/listings/kinds";
import type { GridSDK } from "@/lib/sdk/types";

export interface Opt {
  id: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
  badge?: string;
  /** Carried value (price, code, name…). */
  value?: string | number;
}

type Done = { send: string } | { fill: string };
export interface Step {
  title: string;
  placeholder: string;
  load: (q: string) => Promise<Opt[]> | Opt[];
  /** Turn typed text into an option (e.g. an amount or a place) when no option fits. */
  free?: (q: string) => Opt | null;
  pick: (o: Opt) => Step | Done;
}

export interface DeskContext {
  /** Listings seen in this conversation, newest first. */
  recent: { code: string; name: string; price: number; lease: boolean }[];
  lastIntent: string | null;
}

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  keywords: string;
  start: () => Step | Done;
}

// -- value helpers --

export const peso = (n: number) => (n >= 1_000_000 ? `₱${+(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `₱${+(n / 1000).toFixed(1)}k` : `₱${n}`);
/** "7.6m", "7,600,000", "60k", "₱8M" → pesos. */
export function parseAmount(q: string): number | null {
  const m = q.replace(/[₱,\s]|php/gi, "").match(/^(\d+(?:\.\d+)?)(m|mil|million|k)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const u = (m[2] ?? "").toLowerCase();
  const v = u.startsWith("m") ? n * 1e6 : u === "k" ? n * 1e3 : n;
  return v > 0 ? Math.round(v) : null;
}
const match = (q: string, ...xs: (string | undefined)[]) => {
  const t = q.trim().toLowerCase();
  return !t || xs.some((x) => x?.toLowerCase().includes(t));
};
const filter = (opts: Opt[], q: string) => opts.filter((o) => match(q, o.label, o.hint));
const kindWord = (id: string) => KINDS[id]?.words[0] ?? id.replace(/-/g, " ");
const amountOpt = (q: string, verb = "Use"): Opt | null => {
  const n = parseAmount(q);
  return n ? { id: `amt-${n}`, label: `${verb} ${peso(n)}`, value: n, icon: CornerDownLeft } : null;
};
const textOpt = (q: string, verb: string): Opt | null => (q.trim().length > 1 ? { id: `txt-${q}`, label: `${verb} “${q.trim()}”`, value: q.trim(), icon: CornerDownLeft } : null);

export function useCommandMenu(grid: GridSDK, ctx: DeskContext, done: { send: (t: string) => void; fill: (t: string) => void }) {
  const [stack, setStack] = useState<{ step: Step; crumb: string }[]>([]);
  const [rootOpen, setRootOpen] = useState(false);
  const [options, setOptionsRaw] = useState<Opt[]>([]);
  const [hi, setHi] = useState(0);
  const setOptions = useCallback((o: Opt[]) => {
    setOptionsRaw(o);
    setHi(0);
  }, []);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const seq = useRef(0);

  // ---- data (loaded on demand, cached for the session) ----
  const cache = useRef(new Map<string, Promise<unknown>>());
  const once = useCallback(<T,>(key: string, fn: () => Promise<T>) => {
    if (!cache.current.has(key)) cache.current.set(key, fn().catch(() => (cache.current.delete(key), [] as unknown as T)));
    return cache.current.get(key) as Promise<T>;
  }, []);
  const facets = useCallback(() => once("facets", () => grid.listings.facets()), [grid, once]);
  const lenders = useCallback(() => once("lenders", () => grid.lenders.list()), [grid, once]);

  // ---- shared steps ----
  const priceStep = useCallback(
    (title: string, then: (price: number, label: string) => Step | Done): Step => ({
      title,
      placeholder: "Type an amount (e.g. 7.6M) or pick a listing",
      load: (q) => [
        ...filter(
          ctx.recent.filter((r) => !r.lease).slice(0, 4).map((r) => ({ id: r.code, label: `${peso(r.price)} · ${r.code}`, hint: r.name, value: r.price, icon: Building2, badge: "From chat" })),
          q,
        ),
        ...filter([3e6, 5e6, 7.6e6, 10e6, 15e6].map((n) => ({ id: `p${n}`, label: peso(n), value: n })), q),
      ],
      free: (q) => amountOpt(q),
      pick: (o) => then(Number(o.value), o.badge === "From chat" ? o.id : peso(Number(o.value))),
    }),
    [ctx.recent],
  );
  const choice = useCallback(
    (title: string, items: [string, string, string?][], then: (value: string, label: string) => Step | Done): Step => ({
      title,
      placeholder: "Pick one or type to filter",
      load: (q) => filter(items.map(([value, label, hint]) => ({ id: value, label, hint, value })), q),
      pick: (o) => then(String(o.value), o.label),
    }),
    [],
  );

  const termAndSend = useCallback(
    (prefix: string): Step =>
      choice("Down payment", [["10", "10% down"], ["20", "20% down", "Most common"], ["30", "30% down"], ["50", "50% down"]], (down) =>
        choice("Loan term", [["10", "10 years"], ["15", "15 years"], ["20", "20 years", "Most common"], ["25", "25 years"], ["30", "30 years"]], (term) => ({ send: `${prefix}, ${down}% down, ${term} years` })),
      ),
    [choice],
  );

  /** Rent/buy → kind → place → budget, then `finish` writes the sentence. */
  const propertyFlow = useCallback(
    (finish: (a: { tx: "rent" | "sale"; kind?: string; place?: string; budget?: number }) => Step | Done): Step =>
      choice("Buy or rent?", [["sale", "Buy", "For sale"], ["rent", "Rent", "For lease"]], (tx) => {
        const a: { tx: "rent" | "sale"; kind?: string; place?: string; budget?: number } = { tx: tx as "rent" | "sale" };
        return {
          title: "What kind of property?",
          placeholder: "Condo, house and lot, lot, warehouse…",
          load: async (q) => {
            const f = await facets();
            const kinds = (f.byKind ?? []).slice(0, 12).map((k) => ({ id: k.value, label: k.label, hint: `${k.count} listed`, value: k.value }));
            return [{ id: "any", label: "Any kind", value: "" }, ...filter(kinds, q)];
          },
          pick: (k) => {
            a.kind = k.value ? kindWord(String(k.value)) : undefined;
            return {
              title: "Where?",
              placeholder: "City, district or landmark (BGC, Alabang…)",
              load: async (q) => {
                const f = await facets();
                const cities = (f.byCity ?? []).slice(0, 14).map((c) => ({ id: c.city, label: c.city, hint: `${c.province ?? ""} · ${c.count}`, value: c.city }));
                return [{ id: "any", label: "Anywhere", value: "" }, ...filter(cities, q)];
              },
              free: (q) => textOpt(q, "Search in"),
              pick: (p) => {
                a.place = p.value ? String(p.value) : undefined;
                const presets = a.tx === "rent" ? [25e3, 40e3, 60e3, 100e3, 200e3] : [3e6, 5e6, 8e6, 15e6, 30e6];
                return {
                  title: a.tx === "rent" ? "Monthly budget" : "Budget",
                  placeholder: "Type an amount or pick",
                  load: (q) => [{ id: "any", label: "No limit", value: 0 }, ...filter(presets.map((n) => ({ id: `b${n}`, label: `Up to ${peso(n)}${a.tx === "rent" ? "/mo" : ""}`, value: n })), q)],
                  free: (q) => amountOpt(q, "Up to"),
                  pick: (b) => {
                    a.budget = Number(b.value) || undefined;
                    return finish(a);
                  },
                };
              },
            };
          },
        };
      }),
    [choice, facets],
  );
  const describe = (a: { tx: "rent" | "sale"; kind?: string; place?: string; budget?: number }) =>
    `${a.kind ?? "properties"} for ${a.tx === "rent" ? "rent" : "sale"}${a.place ? ` in ${a.place}` : ""}${a.budget ? ` under ${peso(a.budget)}` : ""}`;

  const listingActions = useCallback(
    (code: string, name: string, lease: boolean): Step => ({
      title: name,
      placeholder: "What should I do with this listing?",
      load: (q) =>
        filter(
          [
            { id: "details", label: "Show details", icon: Building2 },
            { id: "buyers", label: "Which saved buyers match it", icon: Handshake },
            ...(lease ? [] : [{ id: "lenders", label: "Compare lenders for it", icon: Landmark }, { id: "costs", label: "Taxes and fees to buy it", icon: Calculator }]),
          ],
          q,
        ),
      pick: (o) =>
        o.id === "details" ? { send: `Details on ${code}` } : o.id === "buyers" ? { send: `Which buyers match ${code}?` } : o.id === "lenders" ? termAndSend(`Compare lenders for ${code}`) : { send: `Cost to buy ${code}` },
    }),
    [termAndSend],
  );

  const commands: Command[] = useMemo(
    () => [
      {
        id: "search",
        label: "Search property",
        hint: "Buy or rent → kind → place → budget",
        icon: Search,
        keywords: "find property finder hanap listing",
        start: () => propertyFlow((a) => ({ send: `Find ${describe(a)}` })),
      },
      {
        id: "match",
        label: "Buyer matching",
        hint: "Score listings 1–10 for a buyer",
        icon: Handshake,
        keywords: "match buyer client score",
        start: () => ({
          title: "Which buyer?",
          placeholder: "Pick a saved buyer or start a new one",
          load: async (q) => {
            const saved = await once("buyers", () => grid.match.buyers());
            return [
              { id: "new", label: "New buyer…", hint: "Answer a few questions", icon: Sparkles },
              ...filter(saved.map((b) => ({ id: b.id, label: b.label, hint: `${b.description} · ${b.matches} matches`, value: b.label, icon: Handshake, badge: "Saved" })), q),
            ];
          },
          pick: (o) =>
            o.id === "new"
              ? propertyFlow((a) =>
                  choice("What is it for?", [["", "Any purpose"], ["to live in", "To live in"], ["for rental income", "Rent out / investment"], ["for business", "Business use"]], (purpose) => ({
                    send: `Match a buyer looking for ${describe(a)}${purpose ? ` ${purpose}` : ""}`,
                  })),
                )
              : { send: `Matches for saved buyer ${o.value}` },
        }),
      },
      {
        id: "calc",
        label: "Calculator",
        hint: "Lenders, affordability, taxes, commission, Maceda…",
        icon: Calculator,
        keywords: "compute loan mortgage tax fee commission maceda foreign afford",
        start: () =>
          choice(
            "Which calculator?",
            [
              ["lenders", "Compare all lenders", "Pag-IBIG and banks side by side"],
              ["one", "One lender's monthly payment", "Pick the bank"],
              ["afford", "Affordability", "From the buyer's income"],
              ["costs", "Taxes and fees to buy", "CGT, DST, transfer tax, registration"],
              ["commission", "Commission", "Net of VAT and withholding"],
              ["maceda", "Maceda refund", "Installment buyer backs out"],
              ["foreign", "Foreign buyer rules", "What a foreigner may own"],
            ],
            (id) => {
              if (id === "lenders") return priceStep("Property price", (_p, label) => termAndSend(`Compare lenders for ${label}`));
              if (id === "one") return lenderStep((name) => priceStep("Property price", (_p, label) => termAndSend(`${name} home loan for ${label}`)));
              if (id === "afford")
                return {
                  title: "Buyer's gross monthly income",
                  placeholder: "Type an amount (e.g. 85k)",
                  load: (q) => filter([40e3, 60e3, 80e3, 120e3, 200e3].map((n) => ({ id: `i${n}`, label: `${peso(n)} a month`, value: n })), q),
                  free: (q) => amountOpt(q),
                  pick: (o) => ({ send: `How much can a buyer earning ${peso(Number(o.value))} a month afford?` }),
                };
              if (id === "costs")
                return priceStep("Selling price", (_p, label) =>
                  choice("Where is it?", [["Metro Manila", "Metro Manila or a city"], ["the province", "A provincial town"]], (where) => ({ send: `Cost to buy ${label} in ${where}` })),
                );
              if (id === "commission")
                return priceStep("Sale price", (_p, label) => choice("Commission rate", [["3", "3%"], ["4", "4%"], ["5", "5%", "Most common"], ["6", "6%"]], (r) => ({ send: `Commission on ${label} at ${r}%` })));
              if (id === "maceda")
                return {
                  title: "Total the buyer has paid",
                  placeholder: "Type an amount (e.g. 900k)",
                  load: () => [],
                  free: (q) => amountOpt(q),
                  pick: (o) =>
                    choice("Years of installments paid", ["1", "2", "3", "4", "5", "6", "8", "10"].map((y) => [y, `${y} year${y === "1" ? "" : "s"}`] as [string, string]), (y) => ({
                      send: `Buyer paid ${peso(Number(o.value))} over ${y} years and wants out. Maceda refund?`,
                    })),
                };
              return choice("What does the foreign buyer want?", [["a condo", "A condo unit"], ["a house and lot", "A house and lot"], ["land", "Land"], ["to lease land", "To lease land"]], (w) => ({
                send: w === "to lease land" ? "Can a foreigner lease land?" : `Can a foreign buyer buy ${w}?`,
              }));
            },
          ),
      },
      {
        id: "listings",
        label: "Listings",
        hint: "Find a listing, then details, buyers, loans or costs",
        icon: Building2,
        keywords: "listing code property inventory",
        start: () => ({
          title: "Which listing?",
          placeholder: "Type a name, building, place or code",
          load: async (q) => {
            const recent = filter(ctx.recent.slice(0, 4).map((r) => ({ id: r.code, label: r.name, hint: `${r.code} · ${peso(r.price)}${r.lease ? "/mo" : ""}`, value: r.lease ? "lease" : "sale", icon: Building2, badge: "From chat" })), q);
            const r = await grid.listings.search(q.trim() ? { query: q.trim(), limit: 8 } : { sort: "newest", limit: 8 });
            const seen = new Set(recent.map((x) => x.id));
            return [
              ...recent,
              ...r.listings.filter((l) => !seen.has(l.code)).map((l) => ({ id: l.code, label: l.name, hint: `${l.code} · ${l.city ?? l.province ?? ""} · ${peso(l.price)}${l.transactionType === "lease" ? "/mo" : ""}`, value: l.transactionType, icon: Building2 })),
            ];
          },
          pick: (o) => listingActions(o.id, o.label, o.value === "lease"),
        }),
      },
      {
        id: "lenders",
        label: "Lenders",
        hint: "Pag-IBIG, BDO, BPI… monthly payment",
        icon: Landmark,
        keywords: "bank loan pagibig mortgage rate",
        start: () => lenderStep((name) => priceStep("Property price", (_p, label) => termAndSend(`${name} home loan for ${label}`))),
      },
      {
        id: "notes",
        label: "Notes",
        hint: "Summarize a note or pull its action items",
        icon: NotebookPen,
        keywords: "note summary todo action items",
        start: () => ({
          title: "Which note?",
          placeholder: "Type to filter your notes",
          load: async (q) => {
            const notes = await once("notes", () => grid.docs.notes());
            return [{ id: "all", label: "All recent notes", icon: Sparkles }, ...filter(notes.map((n) => ({ id: n.path, label: n.name.replace(/\.(md|txt)$/i, ""), hint: n.preview, value: n.name.replace(/\.(md|txt)$/i, ""), icon: NotebookPen })), q)];
          },
          pick: (o) =>
            o.id === "all"
              ? choice("What do you need?", [["sum", "Summarize them"], ["todo", "Action items"]], (w) => ({ send: w === "sum" ? "Summarize my notes" : "Action items from my notes" }))
              : choice(String(o.label), [["sum", "Summarize this note"], ["todo", "Action items in this note"]], (w) => ({ send: w === "sum" ? `Summarize note ${o.value}` : `Action items in note ${o.value}` })),
        }),
      },
      {
        id: "docs",
        label: "Documents",
        hint: "Summaries, dates, amounts and answers from uploads",
        icon: FileText,
        keywords: "document pdf contract upload file ocr",
        start: () => ({
          title: "Which document?",
          placeholder: "Type to filter your uploads",
          load: async (q) => {
            const docs = await grid.docs.list();
            if (!docs.length) return [{ id: "none", label: "No documents yet: use 📎 to upload a PDF, Word file or photo", value: "" }];
            return filter(docs.map((d) => ({ id: d.id, label: d.name, hint: d.summary.slice(0, 120), value: d.name.replace(/\.[a-z0-9]+$/i, ""), icon: FileText })), q);
          },
          pick: (o) =>
            o.id === "none"
              ? { fill: "" }
              : choice(String(o.label), [["sum", "Summarize it"], ["facts", "Key dates and amounts"], ["ask", "Ask a question about it…"]], (w) =>
                  w === "sum" ? { send: `Summarize ${o.value}` } : w === "facts" ? { send: `Key dates and amounts in ${o.value}` } : { fill: `In ${o.value}, what does it say about ` },
                ),
        }),
      },
      { id: "help", label: "What can you do?", hint: "Examples of everything Deal Desk answers", icon: HelpCircle, keywords: "help examples", start: () => ({ send: "What can you do?" }) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grid, ctx.recent, propertyFlow, priceStep, termAndSend, choice, listingActions, once],
  );

  function lenderStep(then: (name: string) => Step | Done): Step {
    return {
      title: "Which lender?",
      placeholder: "Pag-IBIG, BDO, BPI…",
      load: async (q) => {
        const ls = await lenders();
        return filter(
          ls.map((l) => {
            const low = Math.min(...[...l.rates.map((r) => r.ratePct), ...(l.promo?.tiers.map((t) => t.ratePct) ?? [])]);
            return { id: l.id, label: l.name, hint: Number.isFinite(low) ? `from ${low}%${l.basis === "estimate" ? " (est.)" : ""}` : "rate not published", value: l.name, icon: Landmark, badge: l.kind === "government" ? "Gov't" : undefined };
          }),
          q,
        );
      },
      pick: (o) => then(String(o.value)),
    };
  }

  /** Commands in the order the next move is most likely to need them. */
  const ordered = useMemo(() => {
    const prefer: Record<string, string[]> = {
      find_listings: ["listings", "match", "calc"],
      more_results: ["listings", "match", "calc"],
      listing_details: ["calc", "listings", "match"],
      match_buyer: ["listings", "match", "calc"],
      mortgage_compare: ["lenders", "calc", "listings"],
      affordability: ["search", "lenders", "calc"],
      doc_summary: ["docs", "notes"],
      doc_ask: ["docs", "notes"],
      doc_facts: ["docs", "notes"],
      notes_summary: ["notes", "docs"],
    };
    const p = prefer[ctx.lastIntent ?? ""] ?? [];
    return [...commands].sort((a, b) => (p.indexOf(a.id) + 1 || 99) - (p.indexOf(b.id) + 1 || 99)).map((c) => ({ ...c, suggested: p.includes(c.id) }));
  }, [commands, ctx.lastIntent]);

  const active = rootOpen || stack.length > 0;
  const current = stack[stack.length - 1]?.step;

  // Options belong to one step + filter text; a pick made before they arrive waits for them (no stale picks).
  const keyNow = `${stack.length}|${rootOpen}|${q}`;
  const [optsKey, setOptsKey] = useState("");
  const waiters = useRef<{ key: string; resolve: (o: Opt[]) => void }[]>([]);
  const settle = useCallback(
    (key: string, list: Opt[]) => {
      setOptions(list);
      setOptsKey(key);
      waiters.current = waiters.current.filter((w) => (w.key === key ? (w.resolve(list), false) : true));
    },
    [setOptions],
  );

  // Load options for the current level.
  useEffect(() => {
    if (!active) return;
    const id = ++seq.current;
    const key = keyNow;
    const run = async () => {
      if (!current) {
        const t = q.replace(/^\//, "");
        settle(key, ordered.filter((c) => match(t, c.label, c.keywords, c.hint)).map((c) => ({ id: c.id, label: c.label, hint: c.hint, icon: c.icon, badge: c.suggested ? "Suggested" : undefined })));
        return;
      }
      setLoading(true);
      try {
        const list = await current.load(q);
        const extra = current.free?.(q);
        if (id === seq.current) settle(key, extra && !list.some((o) => o.label.toLowerCase() === q.trim().toLowerCase()) ? [extra, ...list] : list);
      } catch {
        if (id === seq.current) settle(key, []);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    };
    const t = setTimeout(run, current && q ? 160 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, current, q, ordered, settle]);
  const ready = optsKey === keyNow;

  const close = useCallback(() => {
    setStack([]);
    setRootOpen(false);
    setQ("");
  }, []);

  /** Returns the text the input box should show after a pick. */
  const choose = useCallback(
    (o: Opt): string => {
      const next = current ? current.pick(o) : ordered.find((c) => c.id === o.id)?.start();
      if (!next) return "";
      if ("send" in next) {
        close();
        done.send(next.send);
        return "";
      }
      if ("fill" in next) {
        close();
        done.fill(next.fill);
        return next.fill;
      }
      setRootOpen(false);
      setOptionsRaw([]);
      setStack((s) => [...s, { step: next, crumb: o.label }]);
      setQ("");
      return "";
    },
    [current, ordered, close, done],
  );

  return {
    active,
    /** Options for exactly what is on screen now (waits for a pending load). */
    whenReady: (): Promise<{ list: Opt[]; fresh: boolean }> =>
      ready ? Promise.resolve({ list: options, fresh: false }) : new Promise((resolve) => waiters.current.push({ key: keyNow, resolve: (list) => resolve({ list, fresh: true }) })),
    options: ready ? options : [],
    hi,
    setHi,
    loading,
    title: current?.title ?? "Commands",
    placeholder: current?.placeholder ?? "Type to filter commands",
    crumbs: stack.map((s) => s.crumb),
    open: () => {
      setRootOpen(true);
      setQ("/");
    },
    close,
    back: () => {
      if (stack.length > 1) setStack((s) => s.slice(0, -1));
      else {
        setStack([]);
        setRootOpen(true);
        setQ("/");
      }
    },
    /** Feed the input box text; opens the root menu when it starts with "/". */
    onInput: (text: string) => {
      if (!stack.length) setRootOpen(text.startsWith("/"));
      setQ(text);
    },
    choose,
  };
}

export type CommandMenu = ReturnType<typeof useCommandMenu>;

export function CommandPanel({ menu, onChoose, onBack }: { menu: CommandMenu; onChoose: (o: Opt) => void; onBack: () => void }) {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${menu.hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [menu.hi]);
  if (!menu.active) return null;
  return (
    <div className="ga-pop absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border border-line bg-white/95 shadow-[0_24px_60px_-20px_rgb(14_25_47/0.45)] backdrop-blur" data-testid="command-menu">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        {menu.crumbs.length > 0 && (
          <button type="button" aria-label="Back" onClick={onBack} className="grid size-6 place-items-center rounded-md text-muted hover:bg-sand hover:text-ink">
            <ArrowLeft size={14} />
          </button>
        )}
        <nav aria-label="Command steps" className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs">
          <span className="rounded-md bg-navy px-1.5 py-0.5 font-mono text-[11px] text-gold">/</span>
          {menu.crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1 text-muted">
              <span className="truncate">{c}</span>
              <ChevronRight size={12} className="shrink-0" aria-hidden />
            </span>
          ))}
          <span className="truncate font-medium text-ink" id="cmd-title">
            {menu.title}
          </span>
        </nav>
        {menu.loading && <span className="ga-dots text-muted" aria-label="Loading" />}
      </div>
      <ul ref={listRef} id="cmd-list" role="listbox" aria-labelledby="cmd-title" className="max-h-72 overflow-auto p-1.5">
        {menu.options.length === 0 && !menu.loading && <li className="px-3 py-3 text-sm text-muted">Nothing matches. Keep typing, or press Backspace to go back.</li>}
        {menu.options.map((o, i) => {
          const Icon = o.icon;
          const on = i === menu.hi;
          return (
            <li key={o.id} role="option" aria-selected={on} data-idx={i} style={{ animationDelay: `${Math.min(i, 8) * 18}ms` }} className="ga-rise">
              <button
                type="button"
                onMouseEnter={() => menu.setHi(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChoose(o)}
                className={`group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${on ? "bg-sand" : ""}`}
              >
                {on && <span className="ga-limelight absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-bronze" aria-hidden />}
                <span className={`grid size-8 shrink-0 place-items-center rounded-lg border transition-colors ${on ? "border-bronze/40 bg-white text-bronze-ink" : "border-line bg-cream text-muted"}`}>
                  {Icon ? <Icon size={15} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs text-muted">{o.hint}</span>}
                </span>
                {o.badge && <span className="shrink-0 rounded-full bg-bronze-soft px-2 py-0.5 text-[10px] font-medium text-bronze-ink">{o.badge}</span>}
                {on && <CornerDownLeft size={13} className="shrink-0 text-muted" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3 border-t border-line bg-cream/70 px-3 py-1.5 text-[11px] text-muted">
        <span>
          <kbd className="ga-kbd">↑</kbd> <kbd className="ga-kbd">↓</kbd> move
        </span>
        <span>
          <kbd className="ga-kbd">Enter</kbd> pick
        </span>
        <span>
          <kbd className="ga-kbd">⌫</kbd> back
        </span>
        <span>
          <kbd className="ga-kbd">Esc</kbd> close
        </span>
      </div>
    </div>
  );
}
