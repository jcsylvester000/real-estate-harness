/** Renders any calculator result: objects as label/value rows, arrays of objects as tables, pesos formatted. */
const PESO_KEYS = /(price|amount|payment|cost|tax|commission|value|total|base|loan|interest|vat|withholding|received|gross|buyer|seller|negotiable|cash|refund|down)/i;

export const php = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const label = (k: string) =>
  k
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

function Value({ k, v }: { k: string; v: unknown }) {
  if (v === null || v === undefined) return <span className="text-muted">n/a</span>;
  if (typeof v === "number") return <span className="tabular-nums">{PESO_KEYS.test(k) && !/percent|rate|months|years|ratio/i.test(k) ? php(v) : v.toLocaleString("en-PH")}</span>;
  if (typeof v === "boolean") return <span>{v ? "Yes" : "No"}</span>;
  if (typeof v === "string") return <span className="whitespace-pre-wrap">{v}</span>;
  if (Array.isArray(v)) {
    if (!v.length) return <span className="text-muted">None</span>;
    if (v.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
      const cols = [...new Set(v.flatMap((x) => Object.keys(x as object)))].filter((c) => !["basis", "note"].includes(c) || v.length < 4);
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} className="border-b border-line bg-sand px-2 py-1.5 font-medium">
                    {label(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.map((row, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} className="border-b border-line px-2 py-1.5 align-top">
                      <Value k={c} v={(row as Record<string, unknown>)[c]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <ul className="list-disc pl-5">
        {v.map((x, i) => (
          <li key={i}>
            <Value k={k} v={x} />
          </li>
        ))}
      </ul>
    );
  }
  return <ResultView data={v as Record<string, unknown>} nested />;
}

export function ResultView({ data, nested = false }: { data: Record<string, unknown>; nested?: boolean }) {
  return (
    <dl className={nested ? "space-y-1" : "divide-y divide-line"}>
      {Object.entries(data)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => (
          <div key={k} className={`grid gap-1 ${nested ? "" : "py-2"} ${v && typeof v === "object" ? "" : "sm:grid-cols-[minmax(0,14rem)_1fr]"}`}>
            <dt className="text-xs font-medium text-muted">{label(k)}</dt>
            <dd className="min-w-0 text-sm">
              <Value k={k} v={v} />
            </dd>
          </div>
        ))}
    </dl>
  );
}
