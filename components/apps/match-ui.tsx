"use client";
/** Match score badge and "why this score" breakdown, shared by Buyer Matching and the listing drawer. */
import { Check, CircleHelp, Minus, X } from "lucide-react";
import type { MatchPart } from "@/lib/sdk/types";

export const scoreTone = (s: number) => (s >= 8 ? "bg-ok text-white" : s >= 6 ? "bg-[#2d6a8f] text-white" : s >= 4 ? "bg-warn text-white" : "bg-bad text-white");
export const scoreWord = (s: number) => (s >= 9 ? "Excellent" : s >= 8 ? "Strong" : s >= 6 ? "Good" : s >= 4 ? "Fair" : "Weak");

export function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const rating = Math.max(1, Math.min(10, Math.round(score)));
  const dim = size === "lg" ? "size-16 text-2xl" : size === "sm" ? "size-9 text-sm" : "size-12 text-lg";
  return (
    <span className={`inline-flex shrink-0 flex-col items-center justify-center rounded-xl font-semibold tabular-nums ${dim} ${scoreTone(score)}`} title={`Match ${score.toFixed(1)} of 10`} aria-label={`Match score ${rating} of 10 (${scoreWord(score)})`}>
      {rating}
      {size !== "sm" && <span className="text-[9px] font-normal opacity-90">/10</span>}
    </span>
  );
}

const IMPORTANCE_LABEL: Record<string, string> = { must: "Must have", important: "Important", nice: "Nice to have", ignore: "Ignored" };

export function MatchBreakdown({ parts }: { parts: MatchPart[] }) {
  return (
    <ul className="space-y-1.5" aria-label="Why this score">
      {parts.map((p) => {
        const Icon = !p.known ? CircleHelp : p.fit >= 0.75 ? Check : p.fit >= 0.4 ? Minus : X;
        const tone = !p.known ? "text-muted" : p.fit >= 0.75 ? "text-ok" : p.fit >= 0.4 ? "text-warn" : "text-bad";
        return (
          <li key={p.criterion} className="text-xs">
            <div className="flex items-center gap-2">
              <Icon size={13} className={`shrink-0 ${tone}`} aria-hidden />
              <span className="w-20 shrink-0 font-medium">{p.label}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded bg-sand" aria-hidden>
                <span className={`block h-full ${p.fit >= 0.75 ? "bg-ok" : p.fit >= 0.4 ? "bg-warn" : "bg-bad"} ${p.known ? "" : "opacity-40"}`} style={{ width: `${Math.round(p.fit * 100)}%` }} />
              </span>
              <span className="w-20 shrink-0 text-right text-[10px] text-muted">{IMPORTANCE_LABEL[p.importance]}</span>
            </div>
            <p className="ml-[21px] text-muted">{p.reason}</p>
          </li>
        );
      })}
    </ul>
  );
}
