"use client";
/** Deal Desk: sources under a research answer, clickable [S1] citations, and Open buttons from the Agent. */
import { ArrowUpRight, BookOpenCheck, ExternalLink } from "lucide-react";
import type { AppAction, ResearchSource } from "@/lib/sdk/types";

const TIER: Record<ResearchSource["tier"], { label: string; cls: string }> = {
  official: { label: "Official", cls: "bg-ok-soft text-ok" },
  research: { label: "Research", cls: "bg-info-soft text-info" },
  news: { label: "News", cls: "bg-sand text-ink-2" },
  portal: { label: "Portal · verify", cls: "bg-warn-soft text-warn" },
  other: { label: "Other", cls: "bg-sand text-muted" },
};

/** [S1] → a link to the source (Markdown link syntax, rendered safely by the Markdown component). */
export function linkCitations(text: string, sources: ResearchSource[] | undefined) {
  if (!sources?.length) return text;
  const by = new Map(sources.map((s) => [s.id, s]));
  return text.replace(/\[(S\d{1,3})\](?!\()/g, (m, id: string) => {
    const s = by.get(id);
    return s && /^https:\/\//.test(s.url) ? `[${id}](${s.url})` : m;
  });
}

const day = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00+08:00` : iso).toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" }) : "");

export function SourceList({ sources }: { sources: ResearchSource[] }) {
  const cited = sources.filter((s) => s.cited);
  const other = sources.filter((s) => !s.cited);
  const row = (s: ResearchSource) => (
    <li key={s.id} className="flex items-start gap-2 py-1.5" data-source={s.id}>
      <span className="mt-0.5 shrink-0 rounded bg-navy px-1.5 font-mono text-[10px] text-cream">{s.id}</span>
      <span className="min-w-0 flex-1">
        <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-[13px] font-medium text-ink hover:underline">
          <span className="truncate">{s.title}</span>
          <ExternalLink size={11} className="shrink-0 text-muted" aria-hidden />
        </a>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
          <span className={`rounded px-1.5 py-px text-[10px] font-semibold ${TIER[s.tier].cls}`}>{TIER[s.tier].label}</span>
          <span>{s.publisher}</span>
          {s.published && <span>Dated {day(s.published)}</span>}
          <span>{s.via === "brief" ? `Built-in brief, checked ${day(s.retrievedAt)}` : s.via === "read" ? `Read ${day(s.retrievedAt)}` : `Search result ${day(s.retrievedAt)}`}</span>
        </span>
      </span>
    </li>
  );
  return (
    <section className="mt-3 rounded-xl border border-line bg-sand/40 px-3 py-2" aria-label="Sources" data-testid="sources">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <BookOpenCheck size={13} className="text-bronze-ink" aria-hidden /> Sources ({cited.length})
      </p>
      {cited.length ? <ul className="divide-y divide-line/70">{cited.map(row)}</ul> : <p className="py-1 text-xs text-muted">No source was cited in this answer.</p>}
      {other.length > 0 && (
        <details className="mt-1 text-xs">
          <summary className="cursor-pointer text-muted">Also read ({other.length})</summary>
          <ul className="divide-y divide-line/70">{other.map(row)}</ul>
        </details>
      )}
    </section>
  );
}

export function ActionButtons({ actions, onOpen }: { actions: AppAction[]; onOpen: (a: AppAction) => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Open in an app">
      {actions.map((a, i) => (
        <button key={`${a.app}-${i}`} type="button" onClick={() => onOpen(a)} className="btn btn-dark h-8 min-h-8 px-3 text-xs" data-action={a.app}>
          {a.label} <ArrowUpRight size={13} aria-hidden />
        </button>
      ))}
    </div>
  );
}
