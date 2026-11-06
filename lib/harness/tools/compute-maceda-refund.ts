// Tool: Maceda Law (RA 6552) grace period and cash surrender value for installment buyers.
// Business rule: 2+ years paid → refund 50% of total payments, +5% per year beyond year 5, max 90%.

import { peso, type HarnessTool } from "./tool-types";

export interface MacedaInput {
  totalPaymentsMade: number;
  yearsOfInstallmentsPaid: number;
  isResidential?: boolean;
}

/** Pure function implementing RA 6552 Secs. 3 and 4. */
export function computeMacedaRefund(input: MacedaInput) {
  if (input.isResidential === false) {
    return { covered: false, explanation: "Maceda Law covers residential real estate only (not industrial lots or commercial buildings)." };
  }
  const years = Math.floor(input.yearsOfInstallmentsPaid);
  if (years < 2) {
    return {
      covered: true,
      tier: "less_than_2_years",
      gracePeriod: "At least 60 days from the due date of the missed installment",
      refundPercent: 0,
      cashSurrenderValue: 0,
      cancellation: "If still unpaid after the grace period, the seller may cancel 30 days after the buyer receives a notarial notice of cancellation.",
      basis: "RA 6552 Sec. 4",
    };
  }
  const refundPercent = Math.min(90, 50 + Math.max(0, years - 5) * 5);
  return {
    covered: true,
    tier: "two_years_or_more",
    gracePeriod: `${years} month(s): one month per year of installments paid, usable once every 5 years`,
    refundPercent,
    cashSurrenderValue: peso(input.totalPaymentsMade * (refundPercent / 100)),
    cancellation: "Cancellation takes effect 30 days after the buyer receives a notarial notice AND the seller pays the full cash surrender value.",
    basis: "RA 6552 Sec. 3",
  };
}

export const computeMacedaRefundTool: HarnessTool<MacedaInput> = {
  definition: {
    name: "compute_maceda_refund",
    description: "Apply the Maceda Law (RA 6552) to an installment buyer: grace period, refund percent and cash surrender value if the sale is cancelled.",
    parameters: {
      type: "object",
      properties: {
        totalPaymentsMade: { type: "number", description: "Total paid so far in PHP, including down payment and deposits", minimum: 0 },
        yearsOfInstallmentsPaid: { type: "number", description: "Years of installments actually paid", minimum: 0 },
        isResidential: { type: "boolean", description: "Property is residential (default true)" },
      },
      required: ["totalPaymentsMade", "yearsOfInstallmentsPaid"],
    },
  },
  run: computeMacedaRefund,
};
