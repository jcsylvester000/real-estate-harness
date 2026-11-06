import { describe, expect, it } from "vitest";
import { LENDERS } from "@/lib/lenders/data";
import { compareLenders, monthlyPayment, quoteLender } from "@/lib/lenders/mortgage";

const L = (id: string) => LENDERS.find((l) => l.id === id)!;

describe("mortgage math", () => {
  it("matches the standard amortization formula", () => {
    // ₱6.08M at 7% for 20 years: the harness's own figure for the same loan is ₱47,138.18.
    expect(Math.round(monthlyPayment(6_080_000, 7, 20) * 100) / 100).toBe(47_138.18);
    expect(monthlyPayment(1_200_000, 0, 10)).toBe(10_000);
  });
});

describe("lender quotes", () => {
  const base = { propertyPrice: 7_600_000, downPaymentPercent: 20, termYears: 20, fixYears: 5, today: "2026-11-06" };
  it("uses the lender's fixing period, or the longest not above the one asked", () => {
    const bpi = quoteLender(L("bpi"), base);
    expect(bpi).toMatchObject({ ratePct: 8, fixYears: 5, loanAmount: 6_080_000, eligible: true });
    const sb = quoteLender(L("securitybank"), { ...base, fixYears: 10 });
    expect(sb).toMatchObject({ ratePct: 7.75, fixYears: 5 });
    expect(sb.notes.join(" ")).toMatch(/10-year fixing not offered/);
  });
  it("applies Pag-IBIG promo tiers by loan amount until the promo ends", () => {
    expect(quoteLender(L("pagibig"), base)).toMatchObject({ ratePct: 5.75, fixYears: 3 });
    expect(quoteLender(L("pagibig"), { ...base, propertyPrice: 5_000_000 })).toMatchObject({ ratePct: 4.5 });
    expect(quoteLender(L("pagibig"), { ...base, today: "2027-01-05" })).toMatchObject({ ratePct: 6.5, fixYears: 5 });
  });
  it("flags lender rules: ceiling, LTV, term, age and affordability", () => {
    const big = quoteLender(L("pagibig"), { ...base, propertyPrice: 16_000_000 });
    expect(big.eligible).toBe(false);
    expect(big.issues.join(" ")).toMatch(/₱10,000,000 ceiling/);
    expect(quoteLender(L("bdo"), { ...base, downPaymentPercent: 10 }).issues.join(" ")).toMatch(/lends up to 80%/);
    expect(quoteLender(L("securitybank"), { ...base, termYears: 25 }).issues.join(" ")).toMatch(/up to 20 years/);
    expect(quoteLender(L("bpi"), { ...base, borrowerAge: 55 }).issues.join(" ")).toMatch(/75 at maturity/);
    expect(quoteLender(L("bpi"), { ...base, monthlyGrossIncome: 100_000 }).issues.join(" ")).toMatch(/above the 35% guideline/);
  });
  it("asks for a quoted rate when the lender does not publish one", () => {
    const m = quoteLender(L("metrobank"), base);
    expect(m.quoted).toBe(false);
    expect(quoteLender(L("metrobank"), { ...base, quotedRatePct: 7.5 })).toMatchObject({ quoted: true, ratePct: 7.5 });
  });
  it("ranks eligible lenders by monthly payment", () => {
    const c = compareLenders(LENDERS, base);
    const eligible = c.quotes.filter((q) => q.eligible).map((q) => q.monthlyPayment!);
    expect(eligible).toEqual([...eligible].sort((a, b) => a - b));
    expect(c.best?.lender).toBe("Pag-IBIG Fund");
  });
});
