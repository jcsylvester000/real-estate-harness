// Philippine transaction rates used by the calculators.
// Business rule: every rate carries its legal basis and the date it was last checked, so the
// AI can show its basis and staff know when to re-verify. Update here only; tools read from here.

export interface RateEntry {
  rate: number; // decimal, e.g. 0.06 = 6%
  basis: string;
  customaryPayer: "seller" | "buyer" | "negotiable";
  verifiedOn: string; // YYYY-MM-DD
  note?: string;
}

export const TAX_RATES = {
  capitalGainsTax: {
    rate: 0.06,
    basis: "NIRC Sec. 24(D): 6% of the higher of gross selling price, BIR zonal value or assessor's fair market value (capital assets only)",
    customaryPayer: "seller",
    verifiedOn: "2026-11-04",
  },
  documentaryStampTax: {
    rate: 0.015,
    basis: "NIRC Sec. 196: ₱15 per ₱1,000 (1.5%) of the higher of selling price, zonal value or fair market value",
    customaryPayer: "buyer",
    verifiedOn: "2026-11-04",
    note: "Payer is by custom or contract; the law allows either party.",
  },
  transferTaxCityOrMetroManila: {
    rate: 0.0075,
    basis: "Local Government Code Secs. 135 and 151: cities and Metro Manila municipalities may levy up to 0.75%",
    customaryPayer: "buyer",
    verifiedOn: "2026-11-04",
    note: "Ceiling rate. The actual rate is set by the city ordinance.",
  },
  transferTaxProvince: {
    rate: 0.005,
    basis: "Local Government Code Sec. 135: provinces may levy up to 0.5%",
    customaryPayer: "buyer",
    verifiedOn: "2026-11-04",
    note: "Ceiling rate. The actual rate is set by the provincial ordinance.",
  },
  registrationFeeEstimate: {
    rate: 0.0025,
    basis: "Registry of Deeds / LRA graduated fee schedule (approximated at about 0.25% of value)",
    customaryPayer: "buyer",
    verifiedOn: "2026-11-04",
    note: "Estimate only. The LRA schedule is graduated; confirm with the Registry of Deeds.",
  },
  notarialFeeEstimate: {
    rate: 0.01,
    basis: "Market practice; notarial fees for a Deed of Absolute Sale are negotiable (often 1% to 2%)",
    customaryPayer: "negotiable",
    verifiedOn: "2026-11-04",
    note: "Estimate only; negotiable with the notary.",
  },
} satisfies Record<string, RateEntry>;

export const LOAN_LIMITS = {
  pagibigMaxLoan: { amount: 10_000_000, verifiedOn: "2026-05-28", source: "Pag-IBIG Fund announcement, 28 May 2026" },
  pagibigMaxTermYears: 30,
  /** Lenders commonly cap the monthly payment at about 35% of gross monthly income (guideline; verify per lender). */
  affordabilityRatioGuideline: 0.35,
};

export const WITHHOLDING_ON_COMMISSIONS = {
  individualUpTo3M: 0.05,
  individualAbove3M: 0.1,
  corporationUpTo720k: 0.1,
  corporationAbove720k: 0.15,
  basis: "RR 11-2018 expanded withholding tax on commissions/professional fees (verify current rates)",
  verifiedOn: "2026-11-04",
};

export const VAT_RATE = 0.12;
