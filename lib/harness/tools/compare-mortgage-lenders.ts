// Tool: monthly amortization at each Philippine lender (Pag-IBIG, banks, developer in-house), with each
// lender's rules (loan ceiling, loan-to-value, term, age, income). Grid Agentic plugs in the editable rates.

import { LENDERS, type Lender } from "@/lib/lenders/data";
import { compareLenders } from "@/lib/lenders/mortgage";
import type { HarnessTool } from "./tool-types";

let source: () => Lender[] | Promise<Lender[]> = () => LENDERS;
export function setLenderSource(s: () => Lender[] | Promise<Lender[]>) {
  source = s;
}

export interface CompareInput {
  propertyPrice: number;
  downPaymentPercent?: number;
  termYears?: number;
  fixYears?: number;
  monthlyGrossIncome?: number;
  borrowerAge?: number;
  lenderIds?: string;
}

export const compareMortgageLendersTool: HarnessTool<CompareInput> = {
  definition: {
    name: "compare_mortgage_lenders",
    description:
      "Compare home-loan monthly payments across Philippine lenders (Pag-IBIG including its 2026 promo tiers, BPI, BDO, Security Bank, EastWest, PSBank, Maybank, China Bank, UnionBank, developer in-house; Metrobank, RCBC, PNB and Landbank do not publish rates). Returns each lender's rate, monthly payment, eligibility issues and whether the rate is an estimate. Prefer this over compute_loan_amortization when the client asks which bank or Pag-IBIG.",
    parameters: {
      type: "object",
      properties: {
        propertyPrice: { type: "number", minimum: 1 },
        downPaymentPercent: { type: "number", minimum: 0, maximum: 100, description: "Default 20" },
        termYears: { type: "integer", minimum: 1, maximum: 35, description: "Default 20" },
        fixYears: { type: "integer", minimum: 1, maximum: 30, description: "Preferred fixing period; default 1" },
        monthlyGrossIncome: { type: "number", description: "For the affordability check" },
        borrowerAge: { type: "integer", minimum: 18, maximum: 80 },
        lenderIds: { type: "string", description: "Comma-separated lender ids to limit to (pagibig, bpi, bdo, securitybank, eastwest, psbank, maybank, chinabank, unionbank, inhouse)" },
      },
      required: ["propertyPrice"],
    },
  },
  async run(input) {
    const lenders = await source();
    const ids = input.lenderIds?.split(",").map((s) => s.trim()).filter(Boolean);
    const r = compareLenders(ids?.length ? lenders.filter((l) => ids.includes(l.id)) : lenders, { termYears: 20, ...input });
    return {
      best: r.best,
      quotes: r.quotes.slice(0, 8).map((q) => ({
        lender: q.lender,
        rate: q.ratePct === null ? "not published" : `${q.ratePct}% (${q.rateLabel})`,
        monthlyPayment: q.monthlyPayment,
        loanAmount: q.loanAmount,
        eligible: q.eligible,
        issues: q.issues,
        estimate: q.basis === "estimate",
        asOf: q.asOf,
      })),
      notPublished: r.quotes.filter((q) => !q.quoted).map((q) => q.lender),
      disclaimer: r.disclaimer,
    };
  },
};
