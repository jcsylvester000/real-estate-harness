// Tool: broker commission with VAT, expanded withholding tax and broker/salesperson split.

import { VAT_RATE, WITHHOLDING_ON_COMMISSIONS as EWT } from "../knowledge/tax-rates";
import { peso, type HarnessTool } from "./tool-types";

export interface CommissionInput {
  salePrice: number;
  commissionRatePercent: number;
  isVatRegistered?: boolean;
  payeeType?: "individual" | "corporation";
  payeeAnnualGrossAboveThreshold?: boolean;
  salespersonSharePercent?: number;
}

/**
 * Gross commission is treated as VAT-exclusive; VAT is added on top when the broker is VAT-registered.
 * EWT is withheld by the payer on the gross commission (excluding VAT).
 */
export function computeCommission(input: CommissionInput) {
  const gross = input.salePrice * (input.commissionRatePercent / 100);
  const vat = input.isVatRegistered ? gross * VAT_RATE : 0;
  const isCorp = input.payeeType === "corporation";
  const above = input.payeeAnnualGrossAboveThreshold ?? false;
  const ewtRate = isCorp ? (above ? EWT.corporationAbove720k : EWT.corporationUpTo720k) : above ? EWT.individualAbove3M : EWT.individualUpTo3M;
  const ewt = gross * ewtRate;
  const netReceived = gross + vat - ewt;
  const salespersonShare = gross * ((input.salespersonSharePercent ?? 0) / 100);

  return {
    grossCommission: peso(gross),
    vat: peso(vat),
    invoiceAmount: peso(gross + vat),
    withholdingRatePercent: ewtRate * 100,
    withholdingTax: peso(ewt),
    netCashReceived: peso(netReceived),
    split: input.salespersonSharePercent
      ? { salespersonGross: peso(salespersonShare), brokerGross: peso(gross - salespersonShare) }
      : undefined,
    basis: EWT.basis,
    disclaimer: "Withholding rate depends on the payee's sworn declaration of gross income; verify with an accountant.",
  };
}

export const computeCommissionTool: HarnessTool<CommissionInput> = {
  definition: {
    name: "compute_commission",
    description: "Compute a real estate broker's commission: gross, VAT, expanded withholding tax, net cash, and broker/salesperson split.",
    parameters: {
      type: "object",
      properties: {
        salePrice: { type: "number", description: "Sale price in PHP", minimum: 1 },
        commissionRatePercent: { type: "number", description: "Commission rate in percent, e.g. 3 or 5", minimum: 0, maximum: 20 },
        isVatRegistered: { type: "boolean", description: "Broker is VAT-registered (adds 12% VAT)" },
        payeeType: { type: "string", enum: ["individual", "corporation"] },
        payeeAnnualGrossAboveThreshold: { type: "boolean", description: "Individual above ₱3M or corporation above ₱720K annual gross" },
        salespersonSharePercent: { type: "number", description: "Percent of the gross commission that goes to the salesperson", minimum: 0, maximum: 100 },
      },
      required: ["salePrice", "commissionRatePercent"],
    },
  },
  run: computeCommission,
};
