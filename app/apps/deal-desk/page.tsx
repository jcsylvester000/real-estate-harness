"use client";
import {
  ArrowUp,
  BookOpenCheck,
  Bot,
  Building2,
  Calculator,
  ChevronRight,
  FileText,
  Handshake,
  History,
  NotebookPen,
  Paperclip,
  Presentation,
  Plus,
  Save,
  Search,
  Slash,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppFrame } from "@/components/apps/app-frame";
import { AddKeyDialog } from "@/components/apps/add-key-dialog";
import { CommandPanel, useCommandMenu, type DeskContext, type IntakeSpec, type Opt } from "@/components/apps/command-menu";
import { TeaserIntake } from "@/components/apps/teaser-intake";
import { ActionButtons, SourceList, linkCitations } from "@/components/apps/research-view";
import { ACCEPT, extractDocument } from "@/components/apps/doc-extract";
import { Markdown } from "@/components/apps/markdown";
import { predict } from "@/components/apps/predict";
import { ResultView, php } from "@/components/apps/result-view";
import { errText } from "@/components/apps/use-grid";
import type { AppAction, ChatTurn, DocSummary, GridSDK, ProviderInfo } from "@/lib/sdk/types";

interface Msg {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  turn?: ChatTurn;
  /** Follow-up chips for local notices (e.g. after an upload). */
  suggestions?: string[];
  /** A Property Teaser intake card ("/" → Property Teaser). */
  intake?: IntakeSpec;
}

/** Start cards: each opens a "/" command flow. */
const STARTERS: { cmd: string; label: string; hint: string; icon: LucideIcon; tone: string }[] = [
  { cmd: "search", label: "Search property", hint: "Buy or rent, kind, place, budget", icon: Search, tone: "from-ok/15" },
  { cmd: "match", label: "Buyer matching", hint: "Score listings 1–10 for a buyer", icon: Handshake, tone: "from-[#7c3a5b]/15" },
  { cmd: "calc", label: "Calculator", hint: "Lenders, affordability, taxes…", icon: Calculator, tone: "from-gold/30" },
  { cmd: "listings", label: "Listings", hint: "Details, buyers, loans, costs", icon: Building2, tone: "from-panel/15" },
  { cmd: "notes", label: "Notes", hint: "Summaries and action items", icon: NotebookPen, tone: "from-bronze/20" },
  { cmd: "docs", label: "Documents", hint: "PDF, Word, photos (OCR)", icon: FileText, tone: "from-info/15" },
  { cmd: "teaser", label: "Property Teaser", hint: "Presentation or trailer from your notes", icon: Presentation, tone: "from-[#7c3a5b]/15" },
  { cmd: "research", label: "Research", hint: "Zonal values, BIR, market · cited (AI key)", icon: BookOpenCheck, tone: "from-ok/15" },
];

const QUICK = [
  "2BR condo for rent in BGC under 60k",
  "Compare lenders for a ₱7.6M condo, 20% down, 20 years",
  "How much can a buyer earning ₱80k a month afford?",
  "Cost to buy a ₱7.6M condo in Pasig?",
  "How many listings do we have?",
  "Can a Japanese client buy a condo?",
];

let n = 0;
const mid = () => `m${Date.now()}${n++}`;

/** Listings mentioned in a turn's tool results, for "which listing?" pickers. */
function listingsIn(turn: ChatTurn): DeskContext["recent"] {
  const out: DeskContext["recent"] = [];
  const add = (l: { code?: string; name?: string; price?: number; transactionType?: string } | undefined) => {
    if (l?.code && l.name && typeof l.price === "number") out.push({ code: l.code, name: l.name, price: l.price, lease: l.transactionType === "lease" });
  };
  for (const t of turn.toolTrace) {
    const r = t.result as Record<string, unknown> | null;
    if (!r || typeof r !== "object") continue;
    if (Array.isArray(r.listings)) (r.listings as never[]).forEach(add);
    if (Array.isArray(r.results)) (r.results as { listing?: never }[]).forEach((x) => add(x.listing));
    if (t.name === "listings.get") add(r as never);
  }
  return out;
}

function Turn({ m, onSave, onAsk, onOpen }: { m: Msg; onSave: (m: Msg) => void; onAsk: (text: string) => void; onOpen: (a: AppAction) => void }) {
  if (m.role === "user")
    return (
      <div className="ga-rise flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-navy to-panel px-4 py-2.5 text-sm whitespace-pre-wrap text-cream shadow-[0_8px_20px_-12px_rgb(14_25_47/0.6)]">{m.content}</p>
      </div>
    );
  if (m.role === "error")
    return (
      <p role="alert" className="ga-rise flex gap-2 rounded-xl border border-bad/20 bg-bad-soft px-3 py-2 text-sm text-bad">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
        {m.content}
      </p>
    );
  const t = m.turn;
  const chips = m.suggestions ?? t?.suggestions ?? [];
  const engine = t?.model === "grid-query-engine";
  return (
    <article className="ga-rise group relative max-w-full overflow-hidden rounded-2xl border border-line bg-white p-4 pl-5 shadow-[var(--shadow-card)]">
      <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-bronze via-gold to-transparent" aria-hidden />
      {t?.mode && (
        <p className={`mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${t.mode === "research" ? "bg-info-soft text-info" : "bg-bronze-soft text-bronze-ink"}`}>
          {t.mode === "research" ? <BookOpenCheck size={11} aria-hidden /> : <Bot size={11} aria-hidden />} {t.mode === "research" ? "Research" : "Agent"}
        </p>
      )}
      <Markdown text={linkCitations((chips.length ? m.content.replace(/\n\n\*\*Next:\*\*[^\n]*/, "") : m.content) || "_(no reply text)_", t?.sources)} className="text-sm" />
      {t?.actions && t.actions.length > 0 && <ActionButtons actions={t.actions} onOpen={onOpen} />}
      {t?.mode === "research" && <SourceList sources={t.sources ?? []} />}
      {t && t.warnings.length > 0 && (
        <ul className="mt-3 space-y-1">
          {t.warnings.map((w, i) => (
            <li key={i} className="flex gap-2 rounded-md bg-warn-soft px-2 py-1.5 text-xs text-warn">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      )}
      {t && t.toolTrace.length > 0 && (
        <details className="mt-3 rounded-xl border border-line bg-sand/60 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-ink-2">
            <Wrench size={13} aria-hidden /> {t.mode === "research" ? `Research steps (${t.toolTrace.length})` : t.mode === "agent" ? "Tools used" : "Calculations used"}: {[...new Set(t.toolTrace.map((x) => x.name))].join(", ")}
          </summary>
          <div className="space-y-3 border-t border-line bg-white p-3">
            {t.toolTrace.map((x, i) => (
              <div key={i}>
                <p className="mb-1 font-mono text-xs text-bronze-ink">{x.name}</p>
                {x.result && typeof x.result === "object" ? <ResultView data={x.result as Record<string, unknown>} /> : <p>{String(x.result)}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Suggested follow-ups">
          {chips.map((s, i) => (
            <button key={s} type="button" onClick={() => onAsk(s)} style={{ animationDelay: `${120 + i * 50}ms` }} className="ga-rise ga-chip">
              <Sparkles size={11} aria-hidden className="text-bronze" /> {s}
            </button>
          ))}
        </div>
      )}
      {t && (
        <footer className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <span className={`size-1.5 rounded-full ${engine ? "bg-gold" : "bg-ok"}`} aria-hidden />
            {engine ? "Query Engine · no AI" : t.model}
          </span>
          {!engine && (
            <span>
              {t.usage.inputTokens + t.usage.cachedInputTokens} in · {t.usage.outputTokens} out
            </span>
          )}
          <span data-testid="turn-cost">{t.estimatedCostPhp === null ? "cost n/a" : `≈ ${php(t.estimatedCostPhp)}`}</span>
          <button type="button" onClick={() => onSave(m)} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 opacity-70 transition-opacity group-hover:opacity-100 hover:bg-sand">
            <Save size={12} aria-hidden /> Save to Files
          </button>
        </footer>
      )}
    </article>
  );
}

/** Animated "working" indicator. */
function Thinking({ engine, mode }: { engine: boolean; mode: Mode }) {
  return (
    <div role="status" className="ga-rise flex items-center gap-3 rounded-2xl border border-line bg-white/70 px-4 py-3 text-sm">
      <span className="ga-orb" aria-hidden />
      <span className="ga-shimmer-text font-medium">{engine ? "Running GRID tools…" : mode === "research" ? "Researching: searching and reading sources (up to a minute)…" : "Working with GRID's apps and calculators…"}</span>
    </div>
  );
}

type Mode = "agent" | "research";

function DealDesk({ grid }: { grid: GridSDK }) {
  const [mode, setModeRaw] = useState<Mode>("agent");
  const setMode = (m: Mode) => {
    setModeRaw(m);
    grid.kv.set("mode", m).catch(() => {});
  };
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState("");
  const [tier, setTier] = useState<"balanced" | "budget">("balanced");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sessions, setSessions] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState(typeof grid.launchArgs.prompt === "string" ? grid.launchArgs.prompt.slice(0, 4000) : "");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [spent, setSpent] = useState<{ today: number; cap: number } | null>(null);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [showDocs, setShowDocs] = useState(false);
  const [reading, setReading] = useState<{ name: string; label: string; pct?: number } | null>(null);
  const [recentAsks, setRecentAsks] = useState<string[]>([]);
  const [addKey, setAddKey] = useState(false);
  const [places, setPlaces] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const sendRef = useRef<(t: string, mode?: Mode) => void>(() => {});
  const providerRef = useRef("");

  // -- conversation context for "/" pickers and predictions --
  const ctx: DeskContext = useMemo(() => {
    const seen = new Set<string>();
    const recent: DeskContext["recent"] = [];
    for (const m of [...msgs].reverse()) {
      if (!m.turn) continue;
      for (const l of listingsIn(m.turn)) {
        if (seen.has(l.code) || recent.length >= 10) continue;
        seen.add(l.code);
        recent.push(l);
      }
    }
    const last = [...msgs].reverse().find((m) => m.turn)?.turn;
    return { recent, lastIntent: last?.intent ?? null };
  }, [msgs]);

  const menu = useCommandMenu(grid, ctx, {
    send: (t) => sendRef.current(t),
    open: (app, args) => grid.ui.openApp(app, args),
    intake: (spec) => setMsgs((m) => [...m, { id: mid(), role: "assistant", content: "", intake: spec }]),
    research: (text) => {
      if (providerRef.current === "demo" || !providerRef.current) {
        setMsgs((m) => [...m, { id: mid(), role: "error", content: "Research needs an AI key: it searches the web and cites its sources. Pick your AI in the menu at the top right, or choose ＋ Add key…" }]);
        return;
      }
      setMode("research");
      sendRef.current(text, "research");
    },
    fill: (t) => {
      setInput(t);
      requestAnimationFrame(() => boxRef.current?.focus());
    },
  });

  const loadDocs = useCallback(() => grid.docs.list().then(setDocs).catch(() => {}), [grid]);
  const loadSessions = useCallback(() => grid.ai.sessions().then(setSessions).catch(() => {}), [grid]);

  useEffect(() => {
    loadDocs();
    loadSessions();
    grid.kv
      .get<string>("mode")
      .then((m) => (m === "research" || m === "agent") && setModeRaw(m))
      .catch(() => {});
    grid.kv
      .get<string[]>("recent-asks")
      .then((r) => setRecentAsks(Array.isArray(r) ? r : []))
      .catch(() => {});
    grid.listings
      .facets()
      .then((f) => setPlaces(f.byCity.slice(0, 40).map((c) => c.city)))
      .catch(() => {});
    grid.ai
      .providers()
      .then(async (list) => {
        setProviders(list);
        const saved = await grid.kv.get<string>("provider").catch(() => null);
        const pick = list.find((p) => p.id === saved && p.configured) ?? list.find((p) => p.isDefault && p.configured) ?? list.find((p) => p.configured);
        setProvider(pick?.id ?? "");
      })
      .catch((e) => setMsgs([{ id: mid(), role: "error", content: errText(e) }]));
  }, [grid, loadDocs, loadSessions]);

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, which React would treat as a cleanup.
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  const upload = async (file: File) => {
    setReading({ name: file.name, label: "Opening" });
    try {
      const doc = await grid.docs.add(await extractDocument(file, (label, pct) => setReading({ name: file.name, label, pct })));
      await loadDocs();
      const facts = [doc.facts.amounts.length && `${doc.facts.amounts.length} amount${doc.facts.amounts.length === 1 ? "" : "s"}`, doc.facts.dates.length && `${doc.facts.dates.length} date${doc.facts.dates.length === 1 ? "" : "s"}`].filter(Boolean).join(", ");
      const ocr = doc.ocrConfidence !== null ? ` Read with OCR (confidence ${doc.ocrConfidence}%)${doc.ocrConfidence < 70 ? ": check figures against the original" : ""}.` : "";
      const short = doc.name.replace(/\.[a-z0-9]+$/i, "");
      setMsgs((m) => [
        ...m,
        {
          id: mid(),
          role: "assistant",
          content: `📄 Added **${doc.name}**: ${doc.pages} page${doc.pages === 1 ? "" : "s"}${facts ? `, found ${facts}` : ""}.${ocr}`,
          suggestions: [`summarize ${short}`, `key dates and amounts in ${short}`, `In ${short}, what does it say about payment?`],
        },
      ]);
    } catch (e) {
      setMsgs((m) => [...m, { id: mid(), role: "error", content: `${file.name}: ${errText(e)}` }]);
    } finally {
      setReading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeDoc = async (d: DocSummary) => {
    if (!(await grid.ui.confirm(`Remove ${d.name} from Deal Desk?`, { danger: true, okLabel: "Remove" }))) return;
    await grid.docs.delete(d.id).catch((e) => grid.ui.notify(errText(e), { tone: "bad" }));
    loadDocs();
  };

  const send = async (text: string, modeFor?: Mode) => {
    const message = text.trim();
    if (!message || busy) return;
    if (message.startsWith("/")) {
      menu.open();
      return;
    }
    setInput("");
    setMsgs((m) => [...m, { id: mid(), role: "user", content: message }]);
    const asks = [message, ...recentAsks.filter((a) => a.toLowerCase() !== message.toLowerCase())].slice(0, 40);
    setRecentAsks(asks);
    grid.kv.set("recent-asks", asks).catch(() => {});
    setBusy(true);
    try {
      const turn = await grid.ai.chat(message, { sessionId, provider: provider || undefined, tier, mode: provider === "demo" ? undefined : modeFor ?? mode });
      setSessionId(turn.sessionId);
      setSpent({ today: turn.spentTodayPhp, cap: turn.dailyCapPhp });
      setMsgs((m) => [...m, { id: mid(), role: "assistant", content: turn.reply, turn }]);
      loadSessions();
    } catch (e) {
      setMsgs((m) => [...m, { id: mid(), role: "error", content: errText(e) }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => boxRef.current?.focus());
    }
  };
  sendRef.current = send;
  providerRef.current = provider;

  const openSession = async (id: string) => {
    try {
      const s = await grid.ai.session(id);
      setSessionId(id);
      setMsgs(s.messages.map((m) => ({ id: mid(), role: m.role, content: m.content })));
      setShowHistory(false);
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };

  const removeSession = async (id: string) => {
    if (!(await grid.ui.confirm("Delete this conversation?", { danger: true, okLabel: "Delete" }))) return;
    await grid.ai.deleteSession(id);
    if (id === sessionId) newChat();
    loadSessions();
  };

  const newChat = () => {
    setSessionId(undefined);
    setMsgs([]);
    setShowHistory(false);
    menu.close();
  };

  const save = async (m: Msg) => {
    const q = [...msgs].slice(0, msgs.indexOf(m)).reverse().find((x) => x.role === "user")?.content ?? "";
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
    const name = await grid.ui.prompt("Save this answer as", `/Deals/deal-desk-${stamp}.md`);
    if (!name) return;
    const body = `# Deal Desk answer\n\n**Question:** ${q}\n\n${m.content}\n\n---\nModel: ${m.turn?.model ?? ""} · Saved ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })}\nGuidance for review by a licensed broker; not legal or tax advice.\n`;
    try {
      await grid.fs.write(name.startsWith("/") ? name : `/Deals/${name}`, body, { createParents: true });
      grid.ui.notify("Saved to Files.", { tone: "ok" });
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };

  // -- composer --
  const ghost = menu.active ? "" : predict(input, { asks: recentAsks, places, docs: docs.map((d) => d.name.replace(/\.[a-z0-9]+$/i, "")) });

  const startCommand = (cmd: string) => {
    menu.open();
    const o: Opt = { id: cmd, label: cmd };
    setInput(menu.choose(o));
    requestAnimationFrame(() => boxRef.current?.focus());
  };
  const pick = (o: Opt) => {
    setInput(menu.choose(o));
    requestAnimationFrame(() => boxRef.current?.focus());
  };

  /** Back one step; from the first step, back to the command list (with "/" in the box). */
  const goBack = () => {
    if (menu.crumbs.length === 1) setInput("/");
    menu.back();
    boxRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu.active) {
      const count = menu.options.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        menu.setHi((menu.hi + 1) % Math.max(1, count));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        menu.setHi((menu.hi - 1 + count) % Math.max(1, count));
      } else if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        e.preventDefault();
        const hi = menu.hi;
        menu.whenReady().then(({ list, fresh }) => {
          const o = list[fresh ? 0 : hi];
          if (o) pick(o);
        });
      } else if (e.key === "Escape") {
        e.preventDefault();
        menu.close();
        setInput("");
      } else if (e.key === "Backspace" && input === "" && menu.crumbs.length) {
        e.preventDefault();
        goBack();
      }
      return;
    }
    if ((e.key === "Tab" || (e.key === "ArrowRight" && e.currentTarget.selectionStart === input.length)) && ghost) {
      e.preventDefault();
      setInput(input + ghost);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  /** Predicted next moves: the last answer's follow-ups, plus commands that fit what is on screen. */
  const upNext = useMemo(() => {
    const last = [...msgs].reverse().find((m) => m.role === "assistant");
    const chips: { label: string; run: () => void; cmd?: boolean }[] = (last?.suggestions ?? last?.turn?.suggestions ?? []).slice(0, 3).map((s) => ({ label: s, run: () => send(s) }));
    const i = ctx.lastIntent;
    if (ctx.recent.length && i !== "listing_details") chips.push({ label: "/listings", cmd: true, run: () => startCommand("listings") });
    if (i === "find_listings" || i === "listing_details") chips.push({ label: "/buyer matching", cmd: true, run: () => startCommand("match") });
    if (i === "mortgage_compare" || i === "affordability") chips.push({ label: "/lenders", cmd: true, run: () => startCommand("lenders") });
    if (docs.length && !i?.startsWith("doc")) chips.push({ label: "/documents", cmd: true, run: () => startCommand("docs") });
    return chips.slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs, ctx, docs.length]);

  const chosen = providers.find((p) => p.id === provider);
  const engine = provider === "demo";

  return (
    <div className="app-shell ga-desk">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-white/80 px-3 py-2 backdrop-blur">
        <button type="button" className="btn btn-ghost min-h-8 px-2.5 text-xs" onClick={newChat}>
          <Plus size={14} aria-hidden /> New
        </button>
        <button type="button" className="btn btn-ghost min-h-8 px-2.5 text-xs" aria-expanded={showHistory} onClick={() => setShowHistory((s) => !s)}>
          <History size={14} aria-hidden /> History
        </button>
        <button type="button" className="btn btn-ghost min-h-8 px-2.5 text-xs" aria-expanded={showDocs} onClick={() => setShowDocs((s) => !s)}>
          <FileText size={14} aria-hidden /> Documents ({docs.length})
        </button>
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="provider" className="sr-only">
            AI provider
          </label>
          <select
            id="provider"
            value={provider}
            onChange={(e) => {
              if (e.target.value === "__add") {
                setAddKey(true);
                return;
              }
              setProvider(e.target.value);
              grid.kv.set("provider", e.target.value).catch(() => {});
            }}
            className="field h-8 w-auto max-w-56 rounded-full py-0 text-xs"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.configured}>
                {p.label}
              </option>
            ))}
            <option value="__add">＋ Add key…</option>
          </select>
          {!engine && (
            <>
              <label htmlFor="tier" className="sr-only">
                Model tier
              </label>
              <select id="tier" value={tier} onChange={(e) => setTier(e.target.value as "balanced" | "budget")} className="field h-8 w-auto rounded-full py-0 text-xs">
                <option value="balanced">Balanced{chosen ? ` · ${chosen.models.balanced}` : ""}</option>
                <option value="budget">Budget{chosen ? ` · ${chosen.models.budget}` : ""}</option>
              </select>
            </>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {showHistory && (
          <aside aria-label="Past conversations" className="ga-slide-l absolute inset-y-0 left-0 z-10 w-72 overflow-auto border-r border-line bg-white shadow-lg">
            {sessions.length === 0 && <p className="p-4 text-sm text-muted">No saved conversations yet.</p>}
            <ul>
              {sessions.map((s) => (
                <li key={s.id} className="group flex items-center border-b border-line">
                  <button type="button" onClick={() => openSession(s.id)} className={`min-w-0 flex-1 px-3 py-2 text-left text-sm hover:bg-sand ${s.id === sessionId ? "bg-bronze-soft" : ""}`}>
                    <span className="block truncate">{s.title}</span>
                    <span className="text-[11px] text-muted">{new Date(s.updatedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</span>
                  </button>
                  <button type="button" aria-label={`Delete ${s.title}`} onClick={() => removeSession(s.id)} className="mr-1 grid size-8 place-items-center rounded text-muted hover:bg-bad-soft hover:text-bad">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}
        {showDocs && (
          <aside aria-label="Documents" className="ga-slide-r absolute inset-y-0 right-0 z-10 w-80 overflow-auto border-l border-line bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <p className="text-sm font-semibold">Documents</p>
              <button type="button" aria-label="Close documents" onClick={() => setShowDocs(false)} className="grid size-7 place-items-center rounded hover:bg-sand">
                <X size={14} />
              </button>
            </div>
            <p className="px-3 py-2 text-[11px] text-muted">Text is read on this device (PDF, Word, photos with OCR); only the text is stored. Keep IDs and bank numbers out.</p>
            {docs.length === 0 && <p className="px-3 pb-3 text-sm text-muted">No documents yet.</p>}
            <ul>
              {docs.map((d) => (
                <li key={d.id} className="border-t border-line px-3 py-2 text-sm" data-doc={d.name}>
                  <div className="flex items-start gap-2">
                    <FileText size={14} className="mt-0.5 shrink-0 text-bronze" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                    <button type="button" aria-label={`Remove ${d.name}`} onClick={() => removeDoc(d)} className="text-muted hover:text-bad">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs text-muted">{d.summary}</p>
                  <div className="mt-1.5 flex gap-2 text-[11px]">
                    <button type="button" className="underline" onClick={() => send(`summarize ${d.name.replace(/\.[a-z0-9]+$/i, "")}`)}>
                      Summarize
                    </button>
                    <button type="button" className="underline" onClick={() => send(`key dates and amounts in ${d.name.replace(/\.[a-z0-9]+$/i, "")}`)}>
                      Dates & amounts
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <div className="min-h-0 flex-1 overflow-auto px-4 py-5" aria-live="polite">
          {msgs.length === 0 ? (
            <div className="mx-auto max-w-3xl pt-4 text-center">
              <p className="eyebrow ga-rise">{engine ? "Deal Desk · Query Engine (no AI)" : "Deal Desk AI"}</p>
              <h1 className="ga-rise mt-2 text-3xl sm:text-4xl" style={{ animationDelay: "60ms" }}>
                What are we <span className="ga-gradient-text">working on</span>?
              </h1>
              <p className="ga-rise mx-auto mt-2 max-w-lg text-sm text-muted" style={{ animationDelay: "120ms" }}>
                Type <kbd className="ga-kbd">/</kbd> to pick a feature and I&apos;ll ask the rest, or just ask in English, Filipino or Taglish. Answers come from GRID&apos;s calculators, rulebook, listings and your documents.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-2.5 text-left sm:grid-cols-4">
                {STARTERS.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.cmd}
                      type="button"
                      data-starter={s.cmd}
                      onClick={() => startCommand(s.cmd)}
                      style={{ animationDelay: `${160 + i * 50}ms` }}
                      className={`ga-rise spotlight group relative overflow-hidden rounded-2xl text-left border border-line bg-gradient-to-br ${s.tone} to-white p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-bronze/50 hover:shadow-[0_14px_30px_-18px_rgb(14_25_47/0.45)]`}
                    >
                      <span className="grid size-9 place-items-center rounded-xl border border-white/80 bg-white/80 text-navy shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3">
                        <Icon size={17} aria-hidden />
                      </span>
                      <span className="mt-2.5 block text-sm font-semibold text-ink">{s.label}</span>
                      <span className="block text-xs text-muted">{s.hint}</span>
                      <ChevronRight size={14} className="absolute top-3.5 right-3 text-muted opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
                    </button>
                  );
                })}
              </div>
              <p className="ga-rise mt-6 text-[11px] font-medium tracking-wide text-muted uppercase" style={{ animationDelay: "480ms" }}>
                Or try
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {QUICK.map((q, i) => (
                  <button key={q} type="button" onClick={() => send(q)} style={{ animationDelay: `${520 + i * 40}ms` }} className="ga-rise ga-chip">
                    {q}
                  </button>
                ))}
              </div>
              {engine && (
                <p data-testid="smart-mode" className="ga-rise mx-auto mt-6 max-w-lg rounded-xl border border-info/20 bg-info-soft/70 px-3 py-2 text-left text-xs text-info" style={{ animationDelay: "700ms" }}>
                  <strong>Query Engine: works without an AI key.</strong> It remembers the conversation (“how about 15 years?”, “the second one”), reads documents you upload with 📎 (including scans and photos), and only reports figures GRID&apos;s tools return.
                </p>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {msgs.map((m) =>
                m.intake ? (
                  <TeaserIntake key={m.id} grid={grid} spec={m.intake} onClose={() => setMsgs((ms) => ms.filter((x) => x.id !== m.id))} />
                ) : (
                  <Turn key={m.id} m={m} onSave={save} onAsk={(x) => send(x)} onOpen={(a) => grid.ui.openApp(a.app, a.args)} />
                ),
              )}
              {busy && <Thinking engine={engine} mode={mode} />}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      <form
        className="relative border-t border-line bg-gradient-to-b from-white/60 to-white px-3 pt-2 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="relative mx-auto max-w-3xl">
          {!menu.active && upNext.length > 0 && !input && !busy && (
            <div className="mb-2 flex items-center gap-1.5 overflow-x-auto" role="group" aria-label="Up next">
              <span className="shrink-0 text-[10px] font-semibold tracking-wider text-muted uppercase">Up next</span>
              {upNext.map((c, i) => (
                <button key={c.label} type="button" onClick={c.run} style={{ animationDelay: `${i * 40}ms` }} className={`ga-rise ga-chip shrink-0 ${c.cmd ? "font-mono" : ""}`}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {reading && (
            <p className="mb-2 flex items-center gap-2 text-xs text-muted" role="status" data-testid="reading">
              <span className="ga-orb ga-orb-sm" aria-hidden />
              Reading {reading.name}: {reading.label}
              {reading.pct !== undefined ? ` ${Math.round(reading.pct * 100)}%` : "…"}
            </p>
          )}
          <CommandPanel menu={menu} onChoose={pick} onBack={goBack} />
          <div className={`ga-glow rounded-2xl ${menu.active ? "ga-glow-on" : ""}`}>
            <div className="relative rounded-[15px] bg-white">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                aria-label="Upload a document"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                }}
              />
              <div className="relative">
                {/* Ghost text: the predicted rest of the sentence, behind the transparent textarea. */}
                <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden px-4 pt-3 pb-1 text-sm break-words whitespace-pre-wrap">
                  <span className="invisible">{input}</span>
                  <span className="text-muted/60" data-testid="ghost">
                    {ghost}
                  </span>
                </div>
                <label htmlFor="msg" className="sr-only">
                  Message
                </label>
                <textarea
                  id="msg"
                  ref={boxRef}
                  rows={2}
                  maxLength={4000}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    menu.onInput(e.target.value);
                  }}
                  onKeyDown={onKey}
                  role="combobox"
                  aria-controls="cmd-list"
                  aria-expanded={menu.active}
                  aria-autocomplete="list"
                  placeholder={menu.active ? menu.placeholder : "Ask anything, or type / for commands"}
                  className="relative block min-h-[52px] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-ink placeholder:text-muted focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1 px-2 pb-2">
                <button type="button" className="ga-icon-btn" aria-label="Attach a document" title="Attach a PDF, Word file or photo" disabled={!!reading} onClick={() => fileRef.current?.click()}>
                  <Paperclip size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`ga-icon-btn ${menu.active ? "bg-navy text-gold hover:bg-navy" : ""}`}
                  aria-label="Commands"
                  title="Commands (type /)"
                  onClick={() => {
                    if (menu.active) {
                      menu.close();
                      setInput("");
                    } else {
                      setInput("/");
                      menu.open();
                    }
                    boxRef.current?.focus();
                  }}
                >
                  <Slash size={15} aria-hidden />
                </button>
                <div role="radiogroup" aria-label="AI mode" className="ml-1 flex rounded-full bg-sand p-0.5" title={engine ? "Agent and Research need an AI key: pick your AI in the menu at the top right, or Add key…" : "Agent works in Grid's apps; Research searches the web and cites sources"}>
                  {(
                    [
                      ["agent", Bot, "Agent"],
                      ["research", BookOpenCheck, "Research"],
                    ] as const
                  ).map(([k, Icon, label]) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={!engine && mode === k}
                      aria-disabled={engine}
                      onClick={() => {
                        if (!engine) return setMode(k);
                        // No key yet: explain, and offer to add one (a disabled button would just ignore the tap).
                        grid.ui.notify(`${label} needs an AI key. Add one now; the Query Engine stays available.`, { tone: "info" });
                        setAddKey(true);
                      }}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${engine ? "opacity-50" : ""} ${!engine && mode === k ? "bg-navy text-cream shadow-sm" : "text-ink-2 hover:text-ink"}`}
                    >
                      <Icon size={12} aria-hidden /> {label}
                    </button>
                  ))}
                </div>
                <span className="ml-1 hidden truncate text-[11px] text-muted sm:inline">
                  {menu.active ? "↑↓ move · Enter pick · ⌫ back · Esc close" : ghost ? "Tab to accept the suggestion" : "/ for commands · Shift+Enter for a new line"}
                </span>
                <button type="submit" disabled={busy || !input.trim() || !provider || menu.active} className="ga-send ml-auto" aria-label="Send">
                  <ArrowUp size={16} aria-hidden />
                </button>
              </div>
            </div>
          </div>
          {spent && spent.cap > 0 && !engine && (
            <p className="mt-1.5 text-[11px] text-muted">
              AI used today: {php(spent.today)} of {php(spent.cap)}
            </p>
          )}
        </div>
      </form>
      {addKey && (
        <AddKeyDialog
          grid={grid}
          onClose={() => setAddKey(false)}
          onAdded={async (k) => {
            setAddKey(false);
            const list = await grid.ai.providers().catch(() => providers);
            setProviders(list);
            setProvider(`mine:${k.id}`);
            grid.kv.set("provider", `mine:${k.id}`).catch(() => {});
            grid.ui.notify(`${k.name} added and selected. Switch back to the Query Engine any time.`, { tone: "ok" });
          }}
        />
      )}
    </div>
  );
}

export default function DealDeskPage() {
  return <AppFrame>{(grid) => <DealDesk grid={grid} />}</AppFrame>;
}
