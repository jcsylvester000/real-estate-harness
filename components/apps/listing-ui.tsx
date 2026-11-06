"use client";
/** Listing card and detail panel shared by Property Finder and Listings. */
import { BedDouble, Calculator, Copy, Landmark, MapPin, Ruler, Sparkles, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { GridSDK, ListingCard, ListingDetail } from "@/lib/sdk/types";
import { php } from "./result-view";
import { errText } from "./use-grid";

export const priceText = (l: Pick<ListingCard, "price" | "transactionType">) => `${php(l.price)}${l.transactionType === "lease" ? "/mo" : ""}`;
export const placeText = (l: Pick<ListingCard, "city" | "province" | "location">) => [l.city, l.province].filter(Boolean).join(", ") || l.location || "Location not stated";
export const sizeText = (l: Pick<ListingCard, "floorAreaSqm" | "lotAreaSqm">) =>
  l.floorAreaSqm ? `${l.floorAreaSqm.toLocaleString()} sqm` : l.lotAreaSqm ? `${l.lotAreaSqm.toLocaleString()} sqm lot` : null;

export function Chip({ children, tone = "sand" }: { children: React.ReactNode; tone?: "sand" | "navy" | "ok" | "warn" | "info" }) {
  const c = { sand: "bg-sand text-ink-2", navy: "bg-navy text-cream", ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", info: "bg-info-soft text-info" }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${c}`}>{children}</span>;
}

export function ListingCardView({ l, onOpen, starred, onStar }: { l: ListingCard; onOpen: () => void; starred?: boolean; onStar?: () => void }) {
  const size = sizeText(l);
  return (
    <article className="card flex flex-col p-4" data-listing={l.code}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={l.transactionType === "lease" ? "info" : "navy"}>{l.transactionType === "lease" ? "For rent" : "For sale"}</Chip>
        <Chip>
          {l.kindLabel}
          {l.kindInferred ? "*" : ""}
        </Chip>
        {l.gridVerification === "verified" && <Chip tone="ok">GRID verified</Chip>}
        {l.source === "demo" && <Chip tone="warn">demo</Chip>}
        {onStar && (
          <button type="button" onClick={onStar} aria-pressed={starred} aria-label={starred ? `Remove ${l.code} from shortlist` : `Add ${l.code} to shortlist`} className="ml-auto grid size-7 place-items-center rounded hover:bg-sand">
            <Star size={15} className={starred ? "fill-gold text-bronze-ink" : "text-muted"} />
          </button>
        )}
      </div>
      <p className="mt-2 text-lg font-semibold tabular-nums">{priceText(l)}</p>
      <h3 className="mt-0.5 line-clamp-2 font-sans text-sm font-medium">{l.name}</h3>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted">
        <MapPin size={12} aria-hidden /> {placeText(l)}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
        {l.bedrooms !== null && (
          <span className="flex items-center gap-1">
            <BedDouble size={12} aria-hidden /> {l.bedrooms === 0 ? "Studio" : `${l.bedrooms} BR`}
          </span>
        )}
        {size && (
          <span className="flex items-center gap-1">
            <Ruler size={12} aria-hidden /> {size}
          </span>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between pt-3">
        <span className="font-mono text-[11px] text-muted">{l.code}</span>
        <button type="button" onClick={onOpen} className="btn btn-ghost min-h-8 px-3 text-xs">
          Details
        </button>
      </div>
    </article>
  );
}

/** Slide-over with the full listing and next steps (calculators, Deal Desk). */
export function ListingDrawer({ grid, code, onClose, extraActions }: { grid: GridSDK; code: string; onClose: () => void; extraActions?: (l: ListingDetail) => React.ReactNode }) {
  const [l, setL] = useState<ListingDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    grid.listings
      .get(code)
      .then((r) => live && (r ? setL(r) : setError("This listing no longer exists.")))
      .catch((e) => live && setError(errText(e)));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [grid, code, onClose]);

  const rows: [string, React.ReactNode][] = l
    ? [
        ["Code", <span key="c" className="font-mono">{l.code}</span>],
        ["Kind", `${l.kindLabel}${l.kindInferred ? " (guessed from the name)" : ""}`],
        ["Type", l.propertyType.replace(/^./, (c) => c.toUpperCase())],
        ["Price", priceText(l)],
        ["Location", l.location || "Not stated"],
        ["City / province", placeText(l)],
        ["Bedrooms", l.bedrooms === null ? "Not stated" : l.bedrooms === 0 ? "Studio" : l.bedrooms],
        ["Bathrooms", l.bathrooms ?? "Not stated"],
        ["Floor area", l.floorAreaSqm ? `${l.floorAreaSqm.toLocaleString()} sqm` : "Not stated"],
        ["Lot area", l.lotAreaSqm ? `${l.lotAreaSqm.toLocaleString()} sqm` : "Not stated"],
        ["Title", l.titleType || "Not stated"],
        ["Foreign buyer", l.foreignEligible === null ? "Not stated" : l.foreignEligible ? "Eligible (check the 40% quota)" : "Not eligible"],
        ["Availability", l.availability.replace(/^./, (c) => c.toUpperCase())],
        ["Listed by", l.listedBy ? `${l.listedBy}${l.listedByType ? ` (${l.listedByType.replace("re_", "").replace("_", " ")})` : ""}` : "Not stated"],
        ...(l.listedByEmail ? ([["Contact", <a key="e" href={`mailto:${l.listedByEmail}`}>{l.listedByEmail}</a>]] as [string, React.ReactNode][]) : []),
        ["Source", l.source === "grid_export" ? "GRID listings export" : l.source],
      ]
    : [];

  const openCalc = (tool: string, values: Record<string, unknown>) => grid.ui.openApp("calculators", { tool, values });

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-navy/40" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={l ? l.name : "Listing"} className="flex h-full w-full max-w-md flex-col bg-cream shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2 border-b border-line bg-white p-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] text-muted">{code}</p>
            <h2 className="font-sans text-base font-semibold">{l?.name ?? "Loading…"}</h2>
            {l && <p className="mt-1 text-xl font-semibold tabular-nums">{priceText(l)}</p>}
          </div>
          <button type="button" aria-label="Close" autoFocus onClick={onClose} className="grid size-8 place-items-center rounded hover:bg-sand">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {error && <p className="text-sm text-bad">{error}</p>}
          {l && (
            <>
              <dl className="divide-y divide-line rounded-lg border border-line bg-white text-sm">
                {rows.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[8rem_1fr] gap-2 px-3 py-2">
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="min-w-0 break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              {l.notes && <p className="mt-3 text-sm whitespace-pre-wrap">{l.notes}</p>}
              <h3 className="mt-5 mb-2 font-sans text-xs font-semibold tracking-wider text-muted uppercase">Next steps</h3>
              <div className="grid gap-2">
                {l.transactionType === "sale" && (
                  <>
                    <button type="button" className="btn btn-ghost justify-start" onClick={() => openCalc("compute_acquisition_costs", { sellingPrice: l.price, lguType: l.province === "Metro Manila" ? "city_or_metro_manila" : "province" })}>
                      <Landmark size={15} aria-hidden /> Taxes &amp; closing costs
                    </button>
                    <button type="button" className="btn btn-ghost justify-start" onClick={() => openCalc("compute_loan_amortization", { propertyPrice: l.price, downPaymentPercent: 20, annualInterestRatePercent: 7, termYears: 20, lender: "bank" })}>
                      <Calculator size={15} aria-hidden /> Monthly loan payment
                    </button>
                    <button type="button" className="btn btn-ghost justify-start" onClick={() => openCalc("compute_commission", { salePrice: l.price, commissionRatePercent: 5 })}>
                      <Calculator size={15} aria-hidden /> Commission
                    </button>
                  </>
                )}
                {grid.ai.available && (
                  <button type="button" className="btn btn-ghost justify-start" onClick={() => grid.ui.openApp("deal-desk", { prompt: `Tell me about listing ${l.code} and what a buyer should check.` })}>
                    <Sparkles size={15} aria-hidden /> Ask Deal Desk AI about this listing
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost justify-start"
                  onClick={() => navigator.clipboard?.writeText(`${l.code} · ${l.name} · ${priceText(l)} · ${placeText(l)}`).then(() => grid.ui.notify("Copied.", { tone: "ok" }), () => {})}
                >
                  <Copy size={15} aria-hidden /> Copy summary
                </button>
                {extraActions?.(l)}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
