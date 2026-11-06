// Tool: taxes and fees on a Philippine property sale, split by customary payer.
// Business rule: CGT and DST use the HIGHEST of selling price, BIR zonal value and assessor's
// fair market value (NIRC). Dealer/developer sales are ordinary assets and are not computed here.

import { TAX_RATES, type RateEntry } from "../knowledge/tax-rates";
import { peso, type HarnessTool } from "./tool-types";

export interface AcquisitionCostInput {
  sellingPrice: number;
  zonalValue?: number;
  fairMarketValue?: number;
  lguType: "city_or_metro_manila" | "province";
  sellerType?: "individual_capital_asset" | "dealer_or_developer";
  transferTaxRateOverride?: number;
  includeNotarialFee?: boolean;
}

interface LineItem {
  item: string;
  payer: RateEntry["customaryPayer"];
  base: number;
  ratePercent: number;
  amount: number;
  basis: string;
  isEstimate: boolean;
  note?: string;
}

/** Computes taxes and fees for a sale. Pure function; usable without the AI. */
export function computeAcquisitionCosts(input: AcquisitionCostInput) {
  const taxBase = Math.max(input.sellingPrice, input.zonalValue ?? 0, input.fairMarketValue ?? 0);
  const taxBaseSource =
    taxBase === input.sellingPrice ? "selling price" : taxBase === input.zonalValue ? "BIR zonal value" : "assessor's fair market value";
  const isDealer = input.sellerType === "dealer_or_developer";
  const items: LineItem[] = [];
  const add = (item: string, r: RateEntry, base: number, isEstimate = false, rateOverride?: number) => {
    const rate = rateOverride ?? r.rate;
    items.push({ item, payer: r.customaryPayer, base, ratePercent: rate * 100, amount: peso(base * rate), basis: r.basis, isEstimate, note: r.note });
  };

  if (!isDealer) add("Capital Gains Tax", TAX_RATES.capitalGainsTax, taxBase);
  add("Documentary Stamp Tax", TAX_RATES.documentaryStampTax, taxBase);
  const transfer = input.lguType === "province" ? TAX_RATES.transferTaxProvince : TAX_RATES.transferTaxCityOrMetroManila;
  add("Local Transfer Tax", transfer, taxBase, input.transferTaxRateOverride === undefined, input.transferTaxRateOverride);
  add("Registration Fee (Registry of Deeds)", TAX_RATES.registrationFeeEstimate, input.sellingPrice, true);
  if (input.includeNotarialFee !== false) add("Notarial Fee (Deed of Sale)", TAX_RATES.notarialFeeEstimate, input.sellingPrice, true);

  const total = (p: string) => peso(items.filter(i => i.payer === p).reduce((s, i) => s + i.amount, 0));
  const warnings: string[] = [];
  if (isDealer) warnings.push("Seller is a dealer/developer: CGT does not apply. Income tax, creditable withholding tax (1.5%–6%) and possibly 12% VAT apply instead; confirm with an accountant.");
  if (!input.zonalValue) warnings.push("No BIR zonal value given. The BIR taxes the higher of price or zonal value, so taxes may be higher than shown.");

  return {
    taxBase,
    taxBaseSource,
    items,
    totals: { buyer: total("buyer"), seller: total("seller"), negotiable: total("negotiable") },
    buyerCashNeededForClosing: peso(total("buyer") + total("negotiable")),
    warnings,
    disclaimer: "Customary payer shown; the contract may assign costs differently. Rates verified 2026-11-04; confirm with BIR, the LGU and the Registry of Deeds.",
  };
}

export const computeAcquisitionCostsTool: HarnessTool<AcquisitionCostInput> = {
  definition: {
    name: "compute_acquisition_costs",
    description: "Compute Philippine taxes and fees on a property sale (CGT, DST, transfer tax, registration, notarial) with customary payer for each. Always use this instead of doing tax math yourself.",
    parameters: {
      type: "object",
      properties: {
        sellingPrice: { type: "number", description: "Gross selling price in PHP", minimum: 1 },
        zonalValue: { type: "number", description: "BIR zonal value of the property in PHP, if known" },
        fairMarketValue: { type: "number", description: "Assessor's fair market value in PHP, if known" },
        lguType: { type: "string", enum: ["city_or_metro_manila", "province"], description: "Where the property is: a city or Metro Manila municipality, or a provincial municipality" },
        sellerType: { type: "string", enum: ["individual_capital_asset", "dealer_or_developer"], description: "Individual owner (default) or a real estate dealer/developer" },
        transferTaxRateOverride: { type: "number", description: "Exact local transfer tax rate as a decimal if known, e.g. 0.0075", minimum: 0, maximum: 0.0075 },
        includeNotarialFee: { type: "boolean", description: "Include an estimated notarial fee (default true)" },
      },
      required: ["sellingPrice", "lguType"],
    },
  },
  run: computeAcquisitionCosts,
};
