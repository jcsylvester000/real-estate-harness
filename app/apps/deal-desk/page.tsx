"use client";
import { ChevronRight, FileText, History, Paperclip, Plus, Save, Send, Trash2, TriangleAlert, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppFrame } from "@/components/apps/app-frame";
import { Markdown } from "@/components/apps/markdown";
import { ResultView, php } from "@/components/apps/result-view";
import { errText } from "@/components/apps/use-grid";
import { ACCEPT, extractDocument } from "@/components/apps/doc-extract";
import type { ChatTurn, DocSummary, GridSDK, ProviderInfo } from "@/lib/sdk/types";

interface Msg {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  turn?: ChatTurn;
  /** Follow-up chips for local notices (e.g. after an upload). */
  suggestions?: string[];
}

const QUICK = [
  { label: "Find listings", text: "2BR condo for rent in BGC under 60k" },
  { label: "Match a buyer", text: "Match a buyer looking for a house and lot in Cavite, budget 6M, near schools" },
  { label: "Compare lenders", text: "Compare lenders for a ₱7.6M condo, 20% down, 20 years" },
  { label: "Affordability", text: "How much can a buyer earning ₱80k a month afford?" },
  { label: "Cost to buy", text: "Cost to buy a ₱7.6M condo in Pasig?" },
  { label: "What do we have?", text: "How many listings do we have?" },
  { label: "Monthly payment", text: "Monthly payment on ₱7.6M, 20% down, 7%, 20 years" },
  { label: "Maceda refund", text: "Buyer paid ₱900K over 6 years and wants out. Maceda refund?" },
  { label: "Foreign buyer", text: "Can a Japanese client buy a condo?" },
  { label: "Commission", text: "Commission on ₱9.8M at 5%" },
];

let n = 0;
const mid = () => `m${Date.now()}${n++}`;

function Turn({ m, onSave, onAsk }: { m: Msg; onSave: (m: Msg) => void; onAsk: (text: string) => void }) {
  if (m.role === "user")
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-navy px-4 py-2 text-sm whitespace-pre-wrap text-cream">{m.content}</p>
      </div>
    );
  if (m.role === "error")
    return (
      <p role="alert" className="flex gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
        {m.content}
      </p>
    );
  const t = m.turn;
  const chips = m.suggestions ?? t?.suggestions ?? [];
  return (
    <article className="card max-w-full p-4">
      <Markdown text={(t?.suggestions?.length ? m.content.replace(/\n\n\*\*Next:\*\*[^\n]*/, "") : m.content) || "_(no reply text)_"} className="text-sm" />
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
        <details className="mt-3 rounded-lg border border-line bg-sand/60 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-ink-2">
            <Wrench size={13} aria-hidden /> Calculations used: {t.toolTrace.map((x) => x.name).join(", ")}
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
          {chips.map((s) => (
            <button key={s} type="button" onClick={() => onAsk(s)} className="rounded-full border border-line bg-white px-2.5 py-1 text-xs hover:border-bronze hover:bg-bronze-soft">
              {s}
            </button>
          ))}
        </div>
      )}
      {t && (
        <footer className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>{t.model === "grid-query-engine" ? "Query Engine · no AI" : t.model}</span>
          {t.model !== "grid-query-engine" && (
            <span>
              {t.usage.inputTokens + t.usage.cachedInputTokens} in · {t.usage.outputTokens} out
            </span>
          )}
          <span data-testid="turn-cost">{t.estimatedCostPhp === null ? "cost n/a" : `≈ ${php(t.estimatedCostPhp)}`}</span>
          <button type="button" onClick={() => onSave(m)} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-sand">
            <Save size={12} aria-hidden /> Save to Files
          </button>
        </footer>
      )}
    </article>
  );
}

function DealDesk({ grid }: { grid: GridSDK }) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState("");
  const [tier, setTier] = useState<"balanced" | "budget">("balanced");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sessions, setSessions] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState(typeof grid.launchArgs.prompt === "string" ? grid.launchArgs.prompt.slice(0, 4000) : "");
  const realAi = grid.ai.available;
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [spent, setSpent] = useState<{ today: number; cap: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [showDocs, setShowDocs] = useState(false);
  const [reading, setReading] = useState<{ name: string; label: string; pct?: number } | null>(null);
  const loadDocs = useCallback(() => grid.docs.list().then(setDocs).catch(() => {}), [grid]);
  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const upload = async (file: File) => {
    setReading({ name: file.name, label: "Opening" });
    try {
      const input = await extractDocument(file, (label, pct) => setReading({ name: file.name, label, pct }));
      setReading({ name: file.name, label: "Indexing" });
      const doc = await grid.docs.add(input);
      await loadDocs();
      const facts = [doc.facts.amounts.length && `${doc.facts.amounts.length} amount${doc.facts.amounts.length === 1 ? "" : "s"}`, doc.facts.dates.length && `${doc.facts.dates.length} date${doc.facts.dates.length === 1 ? "" : "s"}`].filter(Boolean).join(", ");
      const ocr = doc.ocrConfidence !== null ? ` Read with OCR (confidence ${doc.ocrConfidence}%)${doc.ocrConfidence < 70 ? ": check figures against the original" : ""}.` : "";
      setMsgs((m) => [
        ...m,
        {
          id: mid(),
          role: "assistant",
          content: `📄 Added **${doc.name}**: ${doc.pages} page${doc.pages === 1 ? "" : "s"}${facts ? `, found ${facts}` : ""}.${ocr}`,
          suggestions: [`summarize ${doc.name.replace(/\.[a-z0-9]+$/i, "")}`, "what are the deadlines in the document?", "what does the document say about payment?"],
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

  const loadSessions = useCallback(() => grid.ai.sessions().then(setSessions).catch(() => {}), [grid]);

  useEffect(() => {
    grid.ai
      .providers()
      .then(async (list) => {
        setProviders(list);
        const saved = await grid.kv.get<string>("provider").catch(() => null);
        const pick = list.find((p) => p.id === saved && p.configured) ?? list.find((p) => p.isDefault && p.configured) ?? list.find((p) => p.configured);
        setProvider(pick?.id ?? "");
      })
      .catch((e) => setMsgs([{ id: mid(), role: "error", content: errText(e) }]));
    loadSessions();
  }, [grid, loadSessions]);

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, which React would treat as a cleanup.
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setMsgs((m) => [...m, { id: mid(), role: "user", content: message }]);
    setBusy(true);
    try {
      const turn = await grid.ai.chat(message, { sessionId, provider: provider || undefined, tier });
      setSessionId(turn.sessionId);
      setSpent({ today: turn.spentTodayPhp, cap: turn.dailyCapPhp });
      setMsgs((m) => [...m, { id: mid(), role: "assistant", content: turn.reply, turn }]);
      loadSessions();
    } catch (e) {
      setMsgs((m) => [...m, { id: mid(), role: "error", content: errText(e) }]);
    } finally {
      setBusy(false);
    }
  };

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

  const chosen = providers.find((p) => p.id === provider);

  return (
    <div className="app-shell">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-3 py-2">
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
              setProvider(e.target.value);
              grid.kv.set("provider", e.target.value).catch(() => {});
            }}
            className="field h-8 w-auto py-0 text-xs"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.configured}>
                {p.label}
                {p.configured ? "" : " (no key)"}
              </option>
            ))}
          </select>
          {provider !== "demo" && (
            <>
              <label htmlFor="tier" className="sr-only">
                Model tier
              </label>
              <select id="tier" value={tier} onChange={(e) => setTier(e.target.value as "balanced" | "budget")} className="field h-8 w-auto py-0 text-xs">
                <option value="balanced">Balanced{chosen ? ` · ${chosen.models.balanced}` : ""}</option>
                <option value="budget">Budget{chosen ? ` · ${chosen.models.budget}` : ""}</option>
              </select>
            </>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {showHistory && (
          <aside aria-label="Past conversations" className="absolute inset-y-0 left-0 z-10 w-72 overflow-auto border-r border-line bg-white shadow-lg">
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
          <aside aria-label="Documents" className="absolute inset-y-0 right-0 z-10 w-80 overflow-auto border-l border-line bg-white shadow-lg">
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
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4" aria-live="polite">
          {msgs.length === 0 ? (
            <div className="mx-auto max-w-xl pt-6 text-center">
              <p className="eyebrow">{provider === "demo" ? "Deal Desk · Query Engine (no AI)" : "Deal Desk AI"}</p>
              <h1 className="mt-2 text-3xl">What are we working on?</h1>
              <p className="mt-2 text-sm text-muted">
                Answers use GRID&apos;s fixed calculators, rulebook and inventory, never guessed figures. Every reply shows the calculations used and its cost.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {QUICK.map((q) => (
                  <button key={q.label} type="button" onClick={() => send(q.text)} className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs hover:border-bronze hover:bg-bronze-soft">
                    {q.label} <ChevronRight size={12} aria-hidden />
                  </button>
                ))}
              </div>
              {!realAi && (
                <div data-testid="smart-mode" className="mt-5 rounded-xl border border-info/30 bg-info-soft p-4 text-left text-xs text-info">
                  <p className="font-semibold">Query Engine: works without an AI key</p>
                  <p className="mt-1">
                    Ask in English, Filipino or Taglish. It searches listings, scores buyer matches, compares Pag-IBIG and bank loans, runs the calculators, and reads documents you upload (📎), including scans and photos. It follows up on what you asked before, but it is rule-based: it can&apos;t write free-form answers like an AI.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-ghost min-h-8 px-3 text-xs" onClick={() => grid.ui.openApp("property-finder")}>
                      Open Property Finder
                    </button>
                    <button type="button" className="btn btn-ghost min-h-8 px-3 text-xs" onClick={() => grid.ui.openApp("calculators")}>
                      Open Calculators
                    </button>
                    <button type="button" className="btn btn-ghost min-h-8 px-3 text-xs" onClick={() => grid.ui.openApp("settings", { tab: "ai" })}>
                      How to add an AI key
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {msgs.map((m) => (
                <Turn key={m.id} m={m} onSave={save} onAsk={send} />
              ))}
              {busy && (
                <p className="text-sm text-muted" role="status">
                  Working… running the numbers.
                </p>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      <form
        className="border-t border-line bg-white p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {reading && (
          <p className="mx-auto mb-2 max-w-3xl text-xs text-muted" role="status" data-testid="reading">
            Reading {reading.name}: {reading.label}
            {reading.pct !== undefined ? ` ${Math.round(reading.pct * 100)}%` : "…"}
          </p>
        )}
        <div className="mx-auto flex max-w-3xl items-end gap-2">
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
          <button type="button" className="btn btn-ghost h-11 px-3" aria-label="Attach a document" title="Attach a PDF, Word file or photo" disabled={!!reading} onClick={() => fileRef.current?.click()}>
            <Paperclip size={16} aria-hidden />
          </button>
          <label htmlFor="msg" className="sr-only">
            Message
          </label>
          <textarea
            id="msg"
            rows={2}
            maxLength={4000}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask in English, Filipino or Taglish. Keep TINs, IDs and bank numbers out."
            className="field min-h-11 resize-none"
          />
          <button type="submit" disabled={busy || !input.trim() || !provider} className="btn btn-dark h-11" aria-label="Send">
            <Send size={16} aria-hidden />
          </button>
        </div>
        {spent && spent.cap > 0 && provider !== "demo" && (
          <p className="mx-auto mt-1.5 max-w-3xl text-[11px] text-muted">
            AI used today: {php(spent.today)} of {php(spent.cap)}
          </p>
        )}
      </form>
    </div>
  );
}

export default function DealDeskPage() {
  return <AppFrame>{(grid) => <DealDesk grid={grid} />}</AppFrame>;
}
