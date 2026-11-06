"use client";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { AppFrame } from "@/components/apps/app-frame";
import { ResultView } from "@/components/apps/result-view";
import { errText } from "@/components/apps/use-grid";
import type { JsonSchema, ToolDefinition } from "@/lib/harness/harness/types";
import type { GridSDK } from "@/lib/sdk/types";

const TITLES: Record<string, string> = {
  compute_acquisition_costs: "Taxes & fees",
  compute_loan_amortization: "Loan payment",
  compute_commission: "Commission",
  compute_maceda_refund: "Maceda refund",
  check_foreign_ownership: "Foreign buyer",
};
/** Starting values so each form shows a worked example. */
const EXAMPLES: Record<string, Record<string, unknown>> = {
  compute_acquisition_costs: { sellingPrice: 7600000, lguType: "city_or_metro_manila" },
  compute_loan_amortization: { propertyPrice: 7600000, downPaymentPercent: 20, annualInterestRatePercent: 7, termYears: 20, lender: "bank" },
  compute_commission: { salePrice: 9800000, commissionRatePercent: 5 },
  compute_maceda_refund: { totalPaymentsMade: 900000, yearsOfInstallmentsPaid: 6 },
  check_foreign_ownership: { buyerType: "foreign_individual", propertyType: "condominium" },
};
const label = (k: string) =>
  k
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

function Field({ name, schema, required, value, onChange }: { name: string; schema: JsonSchema; required: boolean; value: unknown; onChange: (v: unknown) => void }) {
  const id = `f-${name}`;
  const hint = schema.description;
  if (schema.type === "boolean")
    return (
      <label htmlFor={id} className="flex items-start gap-2 text-sm">
        <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-4 accent-navy" />
        <span>
          {label(name)}
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
      </label>
    );
  return (
    <div>
      <label htmlFor={id} className="label">
        {label(name)} {required && <span className="text-bad">*</span>}
      </label>
      {schema.enum ? (
        <select id={id} className="field" value={String(value ?? "")} onChange={(e) => onChange(e.target.value || undefined)} required={required}>
          {!required && <option value="">(not set)</option>}
          {schema.enum.map((o) => (
            <option key={o} value={o}>
              {label(o)}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className="field"
          inputMode={schema.type === "string" ? "text" : "decimal"}
          type={schema.type === "string" ? "text" : "number"}
          step="any"
          min={schema.minimum}
          max={schema.maximum}
          required={required}
          value={value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : schema.type === "string" ? e.target.value : Number(e.target.value))}
        />
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Calculators({ grid }: { grid: GridSDK }) {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [active, setActive] = useState("compute_acquisition_costs");
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>(EXAMPLES);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    grid.tools
      .list()
      .then((t) => setTools(t.filter((x) => x.name in TITLES)))
      .catch((e) => setError(errText(e)));
  }, [grid]);

  const tool = tools.find((t) => t.name === active);
  const props = tool?.parameters.properties ?? {};
  const required = new Set(tool?.parameters.required ?? []);
  const vals = values[active] ?? {};

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setResult(await grid.tools.run<Record<string, unknown>>(active, vals));
    } catch (err) {
      setResult(null);
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result) return;
    const name = await grid.ui.prompt("Save this result as", `/Deals/${active.replace(/_/g, "-")}-${new Date().toISOString().slice(0, 10)}.md`);
    if (!name) return;
    const body = `# ${TITLES[active]}\n\n## Inputs\n\n\`\`\`json\n${JSON.stringify(vals, null, 2)}\n\`\`\`\n\n## Result\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n\nComputed by the GRID harness calculators. Estimates for review by a licensed broker and accountant.\n`;
    try {
      await grid.fs.write(name, body, { createParents: true });
      grid.ui.notify("Saved to Files.", { tone: "ok" });
    } catch (err) {
      grid.ui.notify(errText(err), { tone: "bad" });
    }
  };

  return (
    <div className="app-shell">
      <div role="tablist" aria-label="Calculators" className="flex gap-1 overflow-x-auto border-b border-line bg-white px-2 pt-2">
        {Object.entries(TITLES).map(([k, t]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={active === k}
            onClick={() => {
              setActive(k);
              setResult(null);
              setError("");
            }}
            className={`shrink-0 rounded-t-lg border-b-2 px-3 py-2 text-sm ${active === k ? "border-bronze font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 overflow-auto md:grid-cols-[minmax(0,20rem)_1fr]">
        <form onSubmit={run} className="space-y-3 border-b border-line bg-white p-4 md:border-r md:border-b-0" aria-label={TITLES[active]}>
          {tool ? (
            <>
              <p className="text-xs text-muted">{tool.description}</p>
              {Object.entries(props).map(([k, s]) => (
                <Field key={`${active}-${k}`} name={k} schema={s} required={required.has(k)} value={vals[k]} onChange={(v) => setValues((all) => ({ ...all, [active]: { ...all[active], [k]: v } }))} />
              ))}
              <button type="submit" disabled={busy} className="btn btn-dark w-full">
                {busy ? "Calculating…" : "Calculate"}
              </button>
              <p className="text-[11px] text-muted">No AI and no cost. Same calculators the AI uses.</p>
            </>
          ) : (
            <p className="text-sm text-muted">{error || "Loading calculators…"}</p>
          )}
        </form>
        <section aria-label="Result" className="min-w-0 p-4">
          {error && tool && (
            <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
              {error}
            </p>
          )}
          {result ? (
            <div className="card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-sans text-sm font-semibold">Result</h2>
                <button type="button" onClick={save} className="btn btn-ghost min-h-8 px-2.5 text-xs">
                  <Save size={13} aria-hidden /> Save to Files
                </button>
              </div>
              <ResultView data={result} />
            </div>
          ) : (
            !error && <p className="text-sm text-muted">Fill in the form and press Calculate.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export default function CalculatorsPage() {
  return <AppFrame>{(grid) => <Calculators grid={grid} />}</AppFrame>;
}
