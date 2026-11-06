// Tool: monthly payment on a home loan (Pag-IBIG, bank or in-house), with affordability check.

import { LOAN_LIMITS } from "../knowledge/tax-rates";
import { peso, type HarnessTool } from "./tool-types";

export interface AmortizationInput {
  propertyPrice: number;
  downPaymentPercent?: number;
  downPaymentAmount?: number;
  annualInterestRatePercent: number;
  termYears: number;
  lender?: "pagibig" | "bank" | "in_house";
  monthlyGrossIncome?: number;
}

/** Standard fixed-rate amortization: P = L·r / (1 − (1 + r)^−n). Pure function. */
export function computeLoanAmortization(input: AmortizationInput) {
  const down = input.downPaymentAmount ?? input.propertyPrice * ((input.downPaymentPercent ?? 20) / 100);
  const loan = Math.max(0, input.propertyPrice - down);
  const months = Math.round(input.termYears * 12);
  const r = input.annualInterestRatePercent / 100 / 12;
  const monthly = r === 0 ? loan / months : (loan * r) / (1 - Math.pow(1 + r, -months));
  const warnings: string[] = [];

  if (input.lender === "pagibig") {
    if (loan > LOAN_LIMITS.pagibigMaxLoan.amount) warnings.push(`Loan exceeds the Pag-IBIG ceiling of ₱${LOAN_LIMITS.pagibigMaxLoan.amount.toLocaleString("en-PH")} (verified ${LOAN_LIMITS.pagibigMaxLoan.verifiedOn}). Increase the down payment or use a bank.`);
    if (input.termYears > LOAN_LIMITS.pagibigMaxTermYears) warnings.push("Pag-IBIG terms go up to 30 years.");
  }
  let affordability: { ratioPercent: number; withinGuideline: boolean } | undefined;
  if (input.monthlyGrossIncome) {
    const ratio = monthly / input.monthlyGrossIncome;
    affordability = { ratioPercent: peso(ratio * 100), withinGuideline: ratio <= LOAN_LIMITS.affordabilityRatioGuideline };
    if (!affordability.withinGuideline) warnings.push("Monthly payment is above about 35% of gross income; the lender may decline or reduce the loan.");
  }

  return {
    downPayment: peso(down),
    loanAmount: peso(loan),
    months,
    monthlyPayment: peso(monthly),
    totalOfPayments: peso(monthly * months),
    totalInterest: peso(monthly * months - loan),
    affordability,
    warnings,
    disclaimer: "Fixed-rate estimate. Actual rates reprice after the fixing period, and insurance (MRI, fire) is added by the lender.",
  };
}

export const computeLoanAmortizationTool: HarnessTool<AmortizationInput> = {
  definition: {
    name: "compute_loan_amortization",
    description: "Compute down payment, loan amount and monthly amortization for a Philippine home loan, with Pag-IBIG limits and an income affordability check.",
    parameters: {
      type: "object",
      properties: {
        propertyPrice: { type: "number", description: "Total contract price in PHP", minimum: 1 },
        downPaymentPercent: { type: "number", description: "Down payment as percent of price (default 20)", minimum: 0, maximum: 100 },
        downPaymentAmount: { type: "number", description: "Down payment in PHP (overrides percent)" },
        annualInterestRatePercent: { type: "number", description: "Annual interest rate in percent, e.g. 6.25", minimum: 0, maximum: 30 },
        termYears: { type: "number", description: "Loan term in years", minimum: 1, maximum: 30 },
        lender: { type: "string", enum: ["pagibig", "bank", "in_house"] },
        monthlyGrossIncome: { type: "number", description: "Borrower's gross monthly income in PHP, for the affordability check" },
      },
      required: ["propertyPrice", "annualInterestRatePercent", "termYears"],
    },
  },
  run: computeLoanAmortization,
};
