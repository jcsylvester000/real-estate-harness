"use client";
/** Home-loan calculator across Philippine lenders, and the lender-rate editor. Used by the Calculators app. */
import {
  ExternalLink,
  Pencil,
  RotateCcw,
  Save,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { GridSDK, Lender, LenderQuote } from "@/lib/sdk/types";
import { php } from "./result-view";
import { errText } from "./use-grid";

type L = Lender & { edited: boolean };

export interface MortgageForm {
  propertyPrice: number;
  downPaymentPercent: number;
  termYears: number;
  fixYears: number;
  monthlyGrossIncome?: number;
  borrowerAge?: number;
  lenderId: string; // "all" = compare
  quotedRatePct?: number;
  maxDtiPct: number;
}

export const MORTGAGE_DEFAULT: MortgageForm = {
  propertyPrice: 7_600_000,
  downPaymentPercent: 20,
  termYears: 20,
  fixYears: 3,
  lenderId: "all",
  maxDtiPct: 35,
};

function Num({
  id,
  label,
  value,
  onChange,
  step = "any",
  suffix,
}: {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className="field"
          type="number"
          min={0}
          step={step}
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function QuoteRow({ q, best }: { q: LenderQuote; best: boolean }) {
  return (
    <tr
      className={`border-b border-line align-top ${!q.eligible ? "text-muted" : ""} ${best ? "bg-ok-soft/60" : ""}`}
      data-lender={q.lenderId}
    >
      <td className="px-3 py-2">
        <span className="font-medium text-ink">{q.lender}</span>
        {best && (
          <span className="ml-1 rounded bg-ok px-1.5 py-0.5 text-[10px] text-white">
            Lowest
          </span>
        )}
        {q.basis === "estimate" && (
          <span className="ml-1 rounded bg-warn-soft px-1.5 py-0.5 text-[10px] text-warn">
            estimate
          </span>
        )}
        <span className="block text-[11px] text-muted">{q.rateLabel}</span>
      </td>
      <td className="px-3 py-2 tabular-nums">
        {q.ratePct === null ? "—" : `${q.ratePct}%`}
      </td>
      <td className="px-3 py-2 font-semibold tabular-nums">
        {q.monthlyPayment === null ? "—" : php(q.monthlyPayment)}
      </td>
      <td className="px-3 py-2 tabular-nums">
        {q.dtiPct === null ? "" : `${q.dtiPct}%`}
      </td>
      <td className="px-3 py-2 text-[11px]">
        {q.issues.map((i) => (
          <span key={i} className="flex gap-1 text-bad">
            <TriangleAlert size={11} className="mt-0.5 shrink-0" aria-hidden />
            {i}
          </span>
        ))}
        {q.eligible &&
          q.notes.slice(0, 2).map((n) => (
            <span key={n} className="block text-muted">
              {n}
            </span>
          ))}
      </td>
    </tr>
  );
}

export function MortgageCalculator({
  grid,
  initial,
  onSave,
}: {
  grid: GridSDK;
  initial?: Partial<MortgageForm>;
  onSave?: (title: string, body: string) => void;
}) {
  const [f, setF] = useState<MortgageForm>({ ...MORTGAGE_DEFAULT, ...initial });
  const [lenders, setLenders] = useState<L[]>([]);
  const [result, setResult] = useState<{
    quotes: LenderQuote[];
    best: { lender: string } | null;
    disclaimer: string;
  } | null>(null);
  const [error, setError] = useState("");
  const set = (p: Partial<MortgageForm>) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    grid.lenders
      .list()
      .then(setLenders)
      .catch((e) => setError(errText(e)));
  }, [grid]);

  useEffect(() => {
    if (!f.propertyPrice || !f.termYears) return;
    const t = setTimeout(() => {
      grid.lenders
        .compare({
          propertyPrice: f.propertyPrice,
          downPaymentPercent: f.downPaymentPercent,
          termYears: f.termYears,
          fixYears: f.fixYears,
          monthlyGrossIncome: f.monthlyGrossIncome,
          borrowerAge: f.borrowerAge,
          quotedRatePct: f.quotedRatePct,
          maxDtiPct: f.maxDtiPct,
          lenderIds: f.lenderId === "all" ? undefined : [f.lenderId],
        })
        .then((r) => {
          setResult(r);
          setError("");
        })
        .catch((e) => setError(errText(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [grid, f]);

  const lender = lenders.find((l) => l.id === f.lenderId);
  const single = f.lenderId !== "all" ? result?.quotes[0] : undefined;
  const loan = f.propertyPrice * (1 - f.downPaymentPercent / 100);

  const save = () => {
    if (!result || !onSave) return;
    const rows = result.quotes.map(
      (q) =>
        `| ${q.lender} | ${q.ratePct === null ? "not published" : `${q.ratePct}% (${q.rateLabel})`} | ${q.monthlyPayment === null ? "—" : php(q.monthlyPayment)} | ${q.eligible ? "Yes" : q.issues.join("; ")} |`,
    );
    onSave(
      "Home loan comparison",
      [
        `Property ${php(f.propertyPrice)} · ${f.downPaymentPercent}% down · loan ${php(loan)} · ${f.termYears} years${f.monthlyGrossIncome ? ` · income ${php(f.monthlyGrossIncome)}/mo` : ""}`,
        "",
        "| Lender | Rate | Monthly | Eligible |",
        "|---|---|---|---|",
        ...rows,
        "",
        result.disclaimer,
      ].join("\n"),
    );
  };

  return (
    <div className="grid min-h-0 flex-1 overflow-auto md:grid-cols-[minmax(0,20rem)_1fr]">
      <form
        className="space-y-3 border-b border-line bg-white p-4 md:border-r md:border-b-0"
        aria-label="Home loan"
        onSubmit={(e) => e.preventDefault()}
      >
        <div>
          <label htmlFor="mg-lender" className="label">
            Lender
          </label>
          <select
            id="mg-lender"
            className="field"
            value={f.lenderId}
            onChange={(e) => set({ lenderId: e.target.value })}
          >
            <option value="all">Compare all lenders</option>
            {lenders.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.rates.length || l.promo ? "" : " (enter quoted rate)"}
              </option>
            ))}
          </select>
        </div>
        <Num
          id="mg-price"
          label="Property price (₱)"
          value={f.propertyPrice}
          onChange={(v) => set({ propertyPrice: v ?? 0 })}
        />
        <div className="grid grid-cols-2 gap-2">
          <Num
            id="mg-down"
            label="Down payment"
            value={f.downPaymentPercent}
            onChange={(v) => set({ downPaymentPercent: v ?? 0 })}
            suffix="%"
          />
          <Num
            id="mg-term"
            label="Term"
            value={f.termYears}
            onChange={(v) => set({ termYears: v ?? 20 })}
            suffix="yrs"
            step="1"
          />
        </div>
        <div>
          <label htmlFor="mg-fix" className="label">
            Rate fixed for
          </label>
          <select
            id="mg-fix"
            className="field"
            value={f.fixYears}
            onChange={(e) => set({ fixYears: Number(e.target.value) })}
          >
            {[1, 2, 3, 5, 10, 15, 20, 25, 30].map((y) => (
              <option key={y} value={y}>
                {y} year{y === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </div>
        {lender && !lender.rates.length && !lender.promo && (
          <Num
            id="mg-quoted"
            label={`Rate ${lender.name} quoted (%)`}
            value={f.quotedRatePct}
            onChange={(v) => set({ quotedRatePct: v })}
            suffix="%"
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          <Num
            id="mg-income"
            label="Monthly income (₱)"
            value={f.monthlyGrossIncome}
            onChange={(v) => set({ monthlyGrossIncome: v })}
          />
          <Num
            id="mg-age"
            label="Borrower age"
            value={f.borrowerAge}
            onChange={(v) => set({ borrowerAge: v })}
            step="1"
          />
        </div>
        <Num
          id="mg-dti"
          label="Affordability guideline (payment ÷ income)"
          value={f.maxDtiPct}
          onChange={(v) => set({ maxDtiPct: v ?? 35 })}
          suffix="%"
        />
        <p className="text-[11px] text-muted">
          Loan {php(Math.max(0, loan))}. The 35% guideline is a common rule of
          thumb, not a published lender rule.
        </p>
      </form>
      <section aria-label="Home loan result" className="min-w-0 p-4">
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"
          >
            {error}
          </p>
        )}
        {single && (
          <div className="card mb-4 p-4" data-testid="single-quote">
            <p className="text-xs text-muted">
              {single.lender} · {single.rateLabel}
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {single.monthlyPayment === null
                ? "Enter the quoted rate"
                : `${php(single.monthlyPayment)}/mo`}
            </p>
            {single.monthlyPayment !== null && (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                {[
                  ["Rate", `${single.ratePct}%`],
                  ["Loan", php(single.loanAmount)],
                  ["Total interest (est.)", php(single.totalInterest ?? 0)],
                  [
                    "Of income",
                    single.dtiPct === null ? "—" : `${single.dtiPct}%`,
                  ],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] text-muted">{k}</dt>
                    <dd className="font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {[...single.issues, ...single.notes].map((n) => (
              <p
                key={n}
                className={`mt-2 text-xs ${single.issues.includes(n) ? "text-bad" : "text-muted"}`}
              >
                {n}
              </p>
            ))}
          </div>
        )}
        {result && (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <caption className="p-3 text-left text-sm font-semibold">
                {f.lenderId === "all"
                  ? "All lenders, lowest monthly payment first"
                  : "Details"}
              </caption>
              <thead className="bg-sand">
                <tr>
                  {["Lender", "Rate", "Monthly", "Of income", "Notes"].map(
                    (h) => (
                      <th key={h} scope="col" className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {result.quotes.map((q, i) => (
                  <QuoteRow
                    key={q.lenderId}
                    q={q}
                    best={f.lenderId === "all" && i === 0 && q.eligible}
                  />
                ))}
              </tbody>
            </table>
            <p className="p-3 text-[11px] text-muted">{result.disclaimer}</p>
          </div>
        )}
        {onSave && result && (
          <button
            type="button"
            className="btn btn-ghost mt-3 min-h-8 px-3 text-xs"
            onClick={save}
          >
            <Save size={13} aria-hidden /> Save comparison to Files
          </button>
        )}
      </section>
    </div>
  );
}

/** Lender rates table with sources; brokers and admins can update a lender's rates when the bank changes them. */
export function LenderRates({ grid }: { grid: GridSDK }) {
  const canEdit = grid.user?.role === "admin" || grid.user?.role === "broker";
  const [lenders, setLenders] = useState<L[]>([]);
  const [editing, setEditing] = useState<L | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      grid.lenders
        .list()
        .then(setLenders)
        .catch((e) => setError(errText(e))),
    [grid],
  );
  useEffect(() => {
    load();
  }, [load]);

  const save = async (l: L) => {
    try {
      await grid.lenders.save({
        id: l.id,
        name: l.name,
        kind: l.kind,
        rates: l.rates.filter((r) => r.fixYears > 0 && r.ratePct > 0),
        maxLtvPct: l.maxLtvPct,
        maxTermYears: l.maxTermYears,
        minLoan: l.minLoan,
        maxLoan: l.maxLoan,
        maxAgeAtMaturity: l.maxAgeAtMaturity,
        minMonthlyIncome: l.minMonthlyIncome,
        fees: l.fees,
        asOf: l.asOf,
        sourceUrl: l.sourceUrl,
        note: l.note,
      });
      setEditing(null);
      grid.ui.notify(`${l.name} rates saved.`, { tone: "ok" });
      load();
    } catch (e) {
      grid.ui.notify(errText(e), { tone: "bad" });
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {error && <p className="text-sm text-bad">{error}</p>}
      <p className="mb-3 max-w-3xl text-xs text-muted">
        Starting rates were researched on 6 Nov 2026 from each lender&apos;s own
        page where published. &ldquo;Estimate&rdquo; means an aggregator figure.
        Banks change rates often: update a lender here when you get a new rate
        sheet.
      </p>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
        {lenders.map((l) => (
          <article
            key={l.id}
            className="card p-4 text-sm"
            data-lender-card={l.id}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-sans font-semibold">{l.name}</h3>
                <p className="text-[11px] text-muted">
                  {l.kind} · as of {l.asOf} {l.edited ? "· edited" : ""}
                </p>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${l.basis === "fact" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}
              >
                {l.basis === "fact" ? "published" : "estimate"}
              </span>
            </div>
            {l.promo && (
              <p className="mt-2 rounded bg-info-soft px-2 py-1 text-[11px] text-info">
                {l.promo.label} until {l.promo.until}:{" "}
                {l.promo.tiers
                  .map((t) => `${t.ratePct}% ${t.label}`)
                  .join(" · ")}
              </p>
            )}
            {l.rates.length ? (
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {l.rates.map((r) => (
                    <tr key={r.fixYears} className="border-b border-line">
                      <td className="py-1">{r.fixYears}-year fixed</td>
                      <td className="py-1 text-right tabular-nums">
                        {r.ratePct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-xs text-muted">
                Rates not published: enter the quoted rate in the calculator.
              </p>
            )}
            <p className="mt-2 text-[11px] text-muted">
              Up to {l.maxLtvPct}% of price · {l.maxTermYears} yrs max
              {l.maxLoan ? ` · max ${php(l.maxLoan)}` : ""}
              {l.minLoan ? ` · min ${php(l.minLoan)}` : ""}
              {l.maxAgeAtMaturity
                ? ` · age ${l.maxAgeAtMaturity} at maturity`
                : ""}
            </p>
            {l.note && <p className="mt-1 text-[11px] text-muted">{l.note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {l.sourceUrl && (
                <a
                  href={l.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs"
                >
                  Source <ExternalLink size={11} aria-hidden />
                </a>
              )}
              {canEdit && (
                <button
                  type="button"
                  className="ml-auto inline-flex items-center gap-1 text-xs hover:underline"
                  onClick={() =>
                    setEditing({
                      ...l,
                      rates: [...l.rates.map((r) => ({ ...r }))],
                    })
                  }
                >
                  <Pencil size={11} aria-hidden /> Update rates
                </button>
              )}
              {canEdit && l.edited && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-muted hover:underline"
                  onClick={async () => {
                    if (
                      await grid.ui.confirm(
                        `Go back to the researched rates for ${l.name}?`,
                      )
                    ) {
                      await grid.lenders.reset(l.id);
                      load();
                    }
                  }}
                >
                  <RotateCcw size={11} aria-hidden /> Reset
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {editing && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-navy/40 p-3">
          <form
            className="card max-h-full w-full max-w-lg overflow-auto p-5 text-sm"
            aria-label={`Update ${editing.name} rates`}
            onSubmit={(e) => {
              e.preventDefault();
              save(editing);
            }}
          >
            <h2 className="mb-3 font-sans text-base font-semibold">
              Update {editing.name}
            </h2>
            <p className="label">Rates by fixing period</p>
            {editing.rates.map((r, i) => (
              <div key={i} className="mb-1.5 flex items-center gap-2">
                <input
                  aria-label="Years fixed"
                  className="field w-20"
                  type="number"
                  min={1}
                  max={30}
                  value={r.fixYears}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      rates: editing.rates.map((x, j) =>
                        j === i
                          ? { ...x, fixYears: Number(e.target.value) }
                          : x,
                      ),
                    })
                  }
                />
                <span className="text-xs">years at</span>
                <input
                  aria-label="Rate %"
                  className="field w-24"
                  type="number"
                  step="0.01"
                  min={0}
                  value={r.ratePct}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      rates: editing.rates.map((x, j) =>
                        j === i ? { ...x, ratePct: Number(e.target.value) } : x,
                      ),
                    })
                  }
                />
                <span className="text-xs">%</span>
                <button
                  type="button"
                  className="ml-auto text-xs text-bad"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      rates: editing.rates.filter((_, j) => j !== i),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-xs underline"
              onClick={() =>
                setEditing({
                  ...editing,
                  rates: [...editing.rates, { fixYears: 1, ratePct: 7 }],
                })
              }
            >
              Add a fixing period
            </button>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Num
                id="ed-ltv"
                label="Max loan-to-value (%)"
                value={editing.maxLtvPct}
                onChange={(v) => setEditing({ ...editing, maxLtvPct: v ?? 80 })}
              />
              <Num
                id="ed-term"
                label="Max term (years)"
                value={editing.maxTermYears}
                onChange={(v) =>
                  setEditing({ ...editing, maxTermYears: v ?? 20 })
                }
                step="1"
              />
              <Num
                id="ed-min"
                label="Min loan (₱)"
                value={editing.minLoan ?? undefined}
                onChange={(v) => setEditing({ ...editing, minLoan: v ?? null })}
              />
              <Num
                id="ed-max"
                label="Max loan (₱)"
                value={editing.maxLoan ?? undefined}
                onChange={(v) => setEditing({ ...editing, maxLoan: v ?? null })}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ed-asof" className="label">
                  Rates as of
                </label>
                <input
                  id="ed-asof"
                  className="field"
                  type="date"
                  value={editing.asOf}
                  onChange={(e) =>
                    setEditing({ ...editing, asOf: e.target.value })
                  }
                />
              </div>
              <div>
                <label htmlFor="ed-src" className="label">
                  Source link
                </label>
                <input
                  id="ed-src"
                  className="field"
                  type="url"
                  value={editing.sourceUrl}
                  onChange={(e) =>
                    setEditing({ ...editing, sourceUrl: e.target.value })
                  }
                />
              </div>
            </div>
            <label htmlFor="ed-note" className="label mt-2">
              Note
            </label>
            <textarea
              id="ed-note"
              className="field"
              rows={2}
              value={editing.note}
              onChange={(e) => setEditing({ ...editing, note: e.target.value })}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-dark">
                Save rates
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
