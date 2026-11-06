/**
 * Mortgage calculator across Philippine lenders. Pure functions (no I/O), shared by the Calculators app,
 * the compare_mortgage_lenders harness tool and the no-AI Query Engine.
 *
 * Monthly amortization: P = L·r / (1 − (1 + r)^−n), r = annual rate / 12, n = term in months.
 * The rate applies for its fixing period; after that lenders reprice, so totals assume the same rate
 * throughout and are labelled as estimates.
 */
import { DEFAULT_DTI_PCT, type Lender } from "./data";

export interface MortgageInput {
  propertyPrice: number;
  /** Either down payment percent or amount. */
  downPaymentPercent?: number;
  downPaymentAmount?: number;
  termYears: number;
  /** Preferred fixing period; the lender's longest period not above it is used. */
  fixYears?: number;
  monthlyGrossIncome?: number;
  /** Borrower age today, for the age-at-maturity check. */
  borrowerAge?: number;
  /** Rate quoted by a lender that does not publish rates. */
  quotedRatePct?: number;
  /** Use Pag-IBIG's promo tiers when they apply (default true). */
  usePromo?: boolean;
  /** Affordability guideline in percent of income (default 35). */
  maxDtiPct?: number;
  /** Date for promo validity (defaults to today). */
  today?: string;
}

export const monthlyPayment = (loan: number, annualRatePct: number, termYears: number) => {
  const n = Math.round(termYears * 12);
  const r = annualRatePct / 100 / 12;
  if (n <= 0) return 0;
  return r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface LenderQuote {
  lenderId: string;
  lender: string;
  kind: Lender["kind"];
  /** Can this loan be quoted at all (rate known)? */
  quoted: boolean;
  ratePct: number | null;
  rateLabel: string;
  fixYears: number | null;
  loanAmount: number;
  downPayment: number;
  termYears: number;
  monthlyPayment: number | null;
  totalPaid: number | null;
  totalInterest: number | null;
  /** Monthly payment as % of gross income, when income was given. */
  dtiPct: number | null;
  eligible: boolean;
  /** Reasons it fails a lender rule (loan too large, LTV, term, age, income). */
  issues: string[];
  /** Cautions that do not block (estimates, promo end, repricing). */
  notes: string[];
  basis: Lender["basis"];
  verify: boolean;
  asOf: string;
  sourceUrl: string;
}

export function quoteLender(l: Lender, input: MortgageInput): LenderQuote {
  const price = input.propertyPrice;
  const down = input.downPaymentAmount ?? (price * (input.downPaymentPercent ?? 20)) / 100;
  const loan = Math.max(0, price - down);
  const ltvPct = price > 0 ? (loan / price) * 100 : 0;
  const issues: string[] = [];
  const notes: string[] = [];
  const today = input.today ?? new Date().toISOString().slice(0, 10);

  // Rate: promo tier (Pag-IBIG) > published rate for the fixing period > quoted rate.
  let ratePct: number | null = null;
  let fixYears: number | null = null;
  let rateLabel = "";
  const promoOk = l.promo && (input.usePromo ?? true) && today <= l.promo.until;
  const tier = promoOk ? l.promo!.tiers.find((t) => loan <= t.maxLoan) : undefined;
  if (tier) {
    ratePct = tier.ratePct;
    fixYears = l.promo!.fixYears;
    rateLabel = `${l.promo!.label}: ${tier.label}`;
    notes.push(`Promo until ${l.promo!.until}; reprices after ${l.promo!.fixYears} years.`);
    if (tier.ratePct <= 3) notes.push("The 3% socialized rate depends on income eligibility.");
  } else if (l.rates.length) {
    const want = input.fixYears ?? 1;
    const sorted = [...l.rates].sort((a, b) => a.fixYears - b.fixYears);
    const pick = [...sorted].reverse().find((r) => r.fixYears <= want) ?? sorted[0]!;
    ratePct = pick.ratePct;
    fixYears = pick.fixYears;
    rateLabel = `${pick.fixYears}-year fixed`;
    if (input.fixYears && pick.fixYears !== input.fixYears) notes.push(`${input.fixYears}-year fixing not offered; ${pick.fixYears}-year used.`);
  } else if (input.quotedRatePct) {
    ratePct = input.quotedRatePct;
    rateLabel = "Rate you entered (quoted by the lender)";
  } else {
    rateLabel = "Rate not published: enter the rate the lender quotes";
  }

  // Lender rules.
  const maxLtv = l.ltvTiers?.find((t) => loan <= t.maxLoan)?.ltvPct ?? l.maxLtvPct;
  if (ltvPct > maxLtv + 0.01) issues.push(`Loan is ${ltvPct.toFixed(0)}% of the price; ${l.name} lends up to ${maxLtv}% (down payment of at least ${(100 - maxLtv).toFixed(0)}%).`);
  if (l.maxLoan !== null && loan > l.maxLoan) issues.push(`Loan above ${l.name}'s ₱${l.maxLoan.toLocaleString()} ceiling.`);
  if (l.minLoan !== null && loan < l.minLoan) issues.push(`Loan below ${l.name}'s ₱${l.minLoan.toLocaleString()} minimum.`);
  if (input.termYears > l.maxTermYears) issues.push(`${l.name} lends for up to ${l.maxTermYears} years.`);
  if (input.borrowerAge && l.maxAgeAtMaturity && input.borrowerAge + input.termYears > l.maxAgeAtMaturity)
    issues.push(`Borrower would be ${input.borrowerAge + input.termYears} at maturity; ${l.name}'s limit is ${l.maxAgeAtMaturity}.`);
  if (input.monthlyGrossIncome && l.minMonthlyIncome && input.monthlyGrossIncome < l.minMonthlyIncome)
    issues.push(`${l.name} asks for at least ₱${l.minMonthlyIncome.toLocaleString()} monthly income.`);

  const term = Math.min(input.termYears, l.maxTermYears);
  const monthly = ratePct === null ? null : monthlyPayment(loan, ratePct, input.termYears);
  const dti = monthly !== null && input.monthlyGrossIncome ? (monthly / input.monthlyGrossIncome) * 100 : null;
  const maxDti = input.maxDtiPct ?? DEFAULT_DTI_PCT;
  if (dti !== null && dti > maxDti) issues.push(`Payment is ${dti.toFixed(0)}% of income, above the ${maxDti}% guideline.`);
  if (l.basis === "estimate" || l.verify) notes.push(l.basis === "estimate" ? "Rates are estimates: confirm with the lender." : "Confirm current rates with the lender.");
  if (fixYears !== null && fixYears < input.termYears) notes.push(`Rate fixed for ${fixYears} year${fixYears === 1 ? "" : "s"}; totals assume it stays the same after.`);
  void term;

  return {
    lenderId: l.id,
    lender: l.name,
    kind: l.kind,
    quoted: ratePct !== null,
    ratePct,
    rateLabel,
    fixYears,
    loanAmount: round2(loan),
    downPayment: round2(down),
    termYears: input.termYears,
    monthlyPayment: monthly === null ? null : round2(monthly),
    totalPaid: monthly === null ? null : round2(monthly * input.termYears * 12),
    totalInterest: monthly === null ? null : round2(monthly * input.termYears * 12 - loan),
    dtiPct: dti === null ? null : Math.round(dti * 10) / 10,
    eligible: ratePct !== null && issues.length === 0,
    issues,
    notes,
    basis: l.basis,
    verify: l.verify,
    asOf: l.asOf,
    sourceUrl: l.sourceUrl,
  };
}

/** Quotes every lender; eligible quotes first, cheapest monthly payment first. */
export function compareLenders(lenders: Lender[], input: MortgageInput) {
  const quotes = lenders.map((l) => quoteLender(l, input));
  quotes.sort((a, b) => Number(b.eligible) - Number(a.eligible) || Number(b.quoted) - Number(a.quoted) || (a.monthlyPayment ?? Infinity) - (b.monthlyPayment ?? Infinity));
  const best = quotes.find((q) => q.eligible);
  return {
    input: { ...input, downPaymentPercent: input.downPaymentPercent ?? (input.downPaymentAmount ? undefined : 20) },
    quotes,
    best: best ? { lender: best.lender, monthlyPayment: best.monthlyPayment, ratePct: best.ratePct, rateLabel: best.rateLabel } : null,
    disclaimer: "Estimates from published or researched rates; banks reprice after the fixed period and add insurance (MRI, fire). Confirm with the lender before quoting a client.",
  };
}
