/**
 * Philippine home-loan lenders: starting data for the mortgage calculator (editable in the app; the edited
 * copy lives in the lender_rates table). Researched 6 Nov 2026 from each lender's own page where published.
 *
 *  basis "fact":     rate or term stated on the lender's own page (or Pag-IBIG's own announcement as reported).
 *  basis "estimate": from an aggregator or inferred. verify = true means check with the lender before quoting.
 *  Rate pages rarely show an effective date: "asOf" is the date the page was read.
 *  rates: [] means the lender does not publish rates; the calculator asks for the quoted rate instead.
 */

export interface LenderRate {
  /** Years the rate stays fixed. */
  fixYears: number;
  ratePct: number;
}

/** Rate that depends on the loan amount (Pag-IBIG promo tiers). */
export interface LoanTier {
  maxLoan: number;
  ratePct: number;
  label: string;
}

export interface Lender {
  id: string;
  name: string;
  kind: "government" | "bank" | "developer";
  rates: LenderRate[];
  promo?: { label: string; fixYears: number; tiers: LoanTier[]; until: string; note: string };
  /** Max loan as % of the price; may depend on the loan amount (first matching tier wins). */
  maxLtvPct: number;
  ltvTiers?: { maxLoan: number; ltvPct: number }[];
  maxTermYears: number;
  minLoan: number | null;
  maxLoan: number | null;
  maxAgeAtMaturity: number | null;
  minMonthlyIncome: number | null;
  fees: string;
  basis: "fact" | "estimate";
  verify: boolean;
  asOf: string;
  sourceUrl: string;
  note: string;
}

const ACCESSED = "2026-11-06";

export const LENDERS: Lender[] = [
  {
    id: "pagibig",
    name: "Pag-IBIG Fund",
    kind: "government",
    rates: [
      { fixYears: 1, ratePct: 5.75 },
      { fixYears: 3, ratePct: 6.25 },
      { fixYears: 5, ratePct: 6.5 },
      { fixYears: 10, ratePct: 7.125 },
      { fixYears: 15, ratePct: 7.75 },
      { fixYears: 20, ratePct: 8.5 },
      { fixYears: 25, ratePct: 9.125 },
      { fixYears: 30, ratePct: 9.75 },
    ],
    promo: {
      label: "2026 promo rate (3-year fixed)",
      fixYears: 3,
      tiers: [
        { maxLoan: 950_000, ratePct: 3, label: "Socialized (₱950k house and lot; condo limits differ)" },
        { maxLoan: 4_900_000, ratePct: 4.5, label: "Up to ₱4.9M" },
        { maxLoan: 10_000_000, ratePct: 5.75, label: "₱4.9M to ₱10M" },
      ],
      until: "2026-12-31",
      note: "Applications until 31 Dec 2026; reprices after 3 years. Socialized 3% depends on income eligibility. Sources: Inquirer (10 Jul 2026), Tribune (29 Jun 2026).",
    },
    maxLtvPct: 90,
    ltvTiers: [
      { maxLoan: 2_500_000, ltvPct: 95 },
      { maxLoan: 10_000_000, ltvPct: 90 },
    ],
    maxTermYears: 30,
    minLoan: null,
    maxLoan: 10_000_000,
    maxAgeAtMaturity: 70,
    minMonthlyIncome: null,
    fees: "Processing and appraisal fees apply (amounts not published); mortgage redemption and fire insurance required.",
    basis: "estimate",
    verify: true,
    asOf: ACCESSED,
    sourceUrl: "https://business.inquirer.net/599916/pag-ibig-promo-rates-higher-loan-ceiling-help-lower-monthly-payments-amid-higher-lending-rates",
    note: "₱10M ceiling: Philstar 29 May 2026 (fact). Regular rates by fixing period: aggregator (PhilNews, 21 Sep 2026) — confirm on Pag-IBIG's site. 95%/90% loan-to-value split is an aggregator figure; 100% applies to socialized loans.",
  },
  {
    id: "bdo",
    name: "BDO",
    kind: "bank",
    rates: [
      { fixYears: 1, ratePct: 6.75 },
      { fixYears: 3, ratePct: 7.25 },
      { fixYears: 5, ratePct: 8 },
    ],
    maxLtvPct: 80,
    maxTermYears: 20,
    minLoan: 500_000,
    maxLoan: null,
    maxAgeAtMaturity: null,
    minMonthlyIncome: null,
    fees: "Not published.",
    basis: "estimate",
    verify: true,
    asOf: ACCESSED,
    sourceUrl: "https://www.aem.bdo.com.ph/content/dam/cbg/marketing-services/channels/loans/pdf-files/HomeLoan_InterestRatesSummary_May%202026.pdf",
    note: "BDO's May 2026 rate sheet could not be read cleanly; rates shown are an aggregator's (Listd, May 2026). Reprices yearly after the fixed period. 80% LTV (70% vacant lot).",
  },
  {
    id: "bpi",
    name: "BPI",
    kind: "bank",
    rates: [
      { fixYears: 1, ratePct: 7 },
      { fixYears: 2, ratePct: 7.25 },
      { fixYears: 3, ratePct: 7.75 },
      { fixYears: 4, ratePct: 8 },
      { fixYears: 5, ratePct: 8 },
      { fixYears: 10, ratePct: 10.25 },
      { fixYears: 15, ratePct: 10.5 },
      { fixYears: 20, ratePct: 12 },
    ],
    maxLtvPct: 90,
    maxTermYears: 30,
    minLoan: 400_000,
    maxLoan: null,
    maxAgeAtMaturity: 70,
    minMonthlyIncome: 40_000,
    fees: "Not published.",
    basis: "fact",
    verify: false,
    asOf: ACCESSED,
    sourceUrl: "https://www.bpi.com.ph/personal/loans/housing-loan/buy",
    note: "Rates as shown on BPI's housing loan page (no effective date on the page).",
  },
  {
    id: "securitybank",
    name: "Security Bank",
    kind: "bank",
    rates: [
      { fixYears: 1, ratePct: 6.99 },
      { fixYears: 3, ratePct: 7.25 },
      { fixYears: 5, ratePct: 7.75 },
    ],
    maxLtvPct: 90,
    maxTermYears: 20,
    minLoan: 1_000_000,
    maxLoan: null,
    maxAgeAtMaturity: 65,
    minMonthlyIncome: 50_000,
    fees: "Not published.",
    basis: "fact",
    verify: false,
    asOf: ACCESSED,
    sourceUrl: "https://securitybank.com/personal/loans/home-loan-housing-mortgage/",
    note: "90% LTV for accredited developers. Solar mortgage variant 6.75 / 7.00 / 7.50%.",
  },
  {
    id: "eastwest",
    name: "EastWest Bank",
    kind: "bank",
    rates: [
      { fixYears: 1, ratePct: 7 },
      { fixYears: 2, ratePct: 7.75 },
      { fixYears: 3, ratePct: 7.75 },
      { fixYears: 4, ratePct: 7.99 },
      { fixYears: 5, ratePct: 7.99 },
    ],
    maxLtvPct: 90,
    maxTermYears: 30,
    minLoan: 500_000,
    maxLoan: null,
    maxAgeAtMaturity: null,
    minMonthlyIncome: 40_000,
    fees: "Appraisal ₱3,500 (Metro Manila) / ₱5,000 (outside), waived for accredited developers.",
    basis: "fact",
    verify: false,
    asOf: ACCESSED,
    sourceUrl: "https://eastwestbanker.com/loans/home-loan",
    note: "Rates labelled indicative on the bank's page.",
  },
  {
    id: "psbank",
    name: "PSBank",
    kind: "bank",
    rates: [
      { fixYears: 1, ratePct: 7 },
      { fixYears: 2, ratePct: 7.5 },
      { fixYears: 3, ratePct: 7.5 },
      { fixYears: 5, ratePct: 8 },
      { fixYears: 10, ratePct: 9.25 },
      { fixYears: 15, ratePct: 10 },
      { fixYears: 20, ratePct: 10.5 },
      { fixYears: 25, ratePct: 10.5 },
    ],
    maxLtvPct: 80,
    maxTermYears: 25,
    minLoan: null,
    maxLoan: null,
    maxAgeAtMaturity: null,
    minMonthlyIncome: null,
    fees: "Not published.",
    basis: "fact",
    verify: true,
    asOf: ACCESSED,
    sourceUrl: "https://www.psbank.com.ph/psbank-online-loan-amortization-calculator/HomeLoan/Rates",
    note: "Acquisition rates from PSBank's rate page. LTV and age limits not published: 80% assumed.",
  },
  {
    id: "maybank",
    name: "Maybank Philippines",
    kind: "bank",
    rates: [
      { fixYears: 1, ratePct: 7 },
      { fixYears: 3, ratePct: 7.5 },
    ],
    maxLtvPct: 90,
    maxTermYears: 30,
    minLoan: 500_000,
    maxLoan: null,
    maxAgeAtMaturity: 70,
    minMonthlyIncome: null,
    fees: "Not published.",
    basis: "fact",
    verify: true,
    asOf: ACCESSED,
    sourceUrl: "https://www.maybank.com.ph/en/personal/loans/maxihome-loan/home-acquisition.page",
    note: "90% LTV for accredited developers (60% residential lot). 5-year fixing offered, rate not published. Max term from an aggregator.",
  },
  {
    id: "chinabank",
    name: "China Bank",
    kind: "bank",
    rates: [
      { fixYears: 1, ratePct: 7.5 },
      { fixYears: 3, ratePct: 7.5 },
      { fixYears: 5, ratePct: 8 },
    ],
    maxLtvPct: 80,
    maxTermYears: 20,
    minLoan: 500_000,
    maxLoan: null,
    maxAgeAtMaturity: 65,
    minMonthlyIncome: 50_000,
    fees: "Not published.",
    basis: "estimate",
    verify: true,
    asOf: ACCESSED,
    sourceUrl: "https://listd.ph/blog/bank-housing-loan-philippines",
    note: "Rates and terms from aggregators (Listd May 2026, Moneymax): the bank's page could not be read. LTV assumed 80%.",
  },
  {
    id: "unionbank",
    name: "UnionBank",
    kind: "bank",
    rates: [
      { fixYears: 1, ratePct: 6 },
      { fixYears: 5, ratePct: 7.5 },
    ],
    maxLtvPct: 90,
    maxTermYears: 20,
    minLoan: 200_000,
    maxLoan: null,
    maxAgeAtMaturity: 70,
    minMonthlyIncome: null,
    fees: "Not published.",
    basis: "estimate",
    verify: true,
    asOf: ACCESSED,
    sourceUrl: "https://listd.ph/blog/bank-housing-loan-philippines",
    note: "Rates and terms from aggregators (Listd May 2026, Moneymax): the bank's page could not be read.",
  },
  {
    id: "metrobank",
    name: "Metrobank",
    kind: "bank",
    rates: [],
    maxLtvPct: 80,
    maxTermYears: 25,
    minLoan: 1_000_000,
    maxLoan: null,
    maxAgeAtMaturity: null,
    minMonthlyIncome: 40_000,
    fees: "Not published.",
    basis: "estimate",
    verify: true,
    asOf: ACCESSED,
    sourceUrl: "https://www.metrobank.com.ph/articles/loan-rates-and-fees",
    note: "Standard rates are not published. The Feb–May 2026 promo (as low as 6.50%) has ended. Enter the rate the bank quotes.",
  },
  {
    id: "rcbc",
    name: "RCBC",
    kind: "bank",
    rates: [],
    maxLtvPct: 80,
    maxTermYears: 20,
    minLoan: 1_000_000,
    maxLoan: null,
    maxAgeAtMaturity: 70,
    minMonthlyIncome: 40_000,
    fees: "Not published.",
    basis: "fact",
    verify: true,
    asOf: ACCESSED,
    sourceUrl: "https://www.rcbc.com/home-loans",
    note: "Standard rates are not published (terms from the Apr 2026 T&Cs). Enter the rate the bank quotes.",
  },
  {
    id: "pnb",
    name: "PNB",
    kind: "bank",
    rates: [],
    maxLtvPct: 80,
    maxTermYears: 20,
    minLoan: 500_000,
    maxLoan: null,
    maxAgeAtMaturity: 65,
    minMonthlyIncome: null,
    fees: "Not published.",
    basis: "fact",
    verify: true,
    asOf: ACCESSED,
    sourceUrl: "https://forms.pnb.com.ph/homeloan/home-calc.php",
    note: "Rate is set at application. Min loan ₱750k in Metro Manila (aggregator). Enter the rate the bank quotes.",
  },
  {
    id: "landbank",
    name: "Landbank",
    kind: "government",
    rates: [],
    maxLtvPct: 80,
    maxTermYears: 20,
    minLoan: null,
    maxLoan: null,
    maxAgeAtMaturity: null,
    minMonthlyIncome: null,
    fees: "Not published.",
    basis: "estimate",
    verify: true,
    asOf: ACCESSED,
    sourceUrl: "https://landbank.com/housing-loan-calculator",
    note: "Rates and terms not published online. Enter the rate the bank quotes.",
  },
  {
    id: "inhouse",
    name: "Developer in-house financing",
    kind: "developer",
    rates: [
      { fixYears: 5, ratePct: 15 },
      { fixYears: 10, ratePct: 15 },
    ],
    maxLtvPct: 80,
    maxTermYears: 10,
    minLoan: null,
    maxLoan: null,
    maxAgeAtMaturity: null,
    minMonthlyIncome: null,
    fees: "Varies by developer.",
    basis: "estimate",
    verify: true,
    asOf: ACCESSED,
    sourceUrl: "https://listd.ph/spotlight/in-house-financing-philippines",
    note: "Typical range 12–18% a year for 5–10 years with about 20% down (Listd, Jun 2026). 15% shown as a midpoint; use the developer's quote.",
  },
];

/** Default affordability guideline: monthly amortization ≤ this share of gross monthly income. An assumption, not a published lender rule. */
export const DEFAULT_DTI_PCT = 35;
