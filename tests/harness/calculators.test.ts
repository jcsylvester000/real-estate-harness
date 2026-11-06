// Calculator tests: figures checked by hand against the statutory rates.
import assert from "node:assert/strict";
import { test } from "vitest";
import { checkForeignOwnership } from "@/lib/harness/tools/check-foreign-ownership";
import { computeAcquisitionCosts } from "@/lib/harness/tools/compute-acquisition-costs";
import { computeCommission } from "@/lib/harness/tools/compute-commission";
import { computeLoanAmortization } from "@/lib/harness/tools/compute-loan-amortization";
import { computeMacedaRefund } from "@/lib/harness/tools/compute-maceda-refund";
import { searchListings } from "@/lib/harness/tools/search-listings";
import { ToolRegistry } from "@/lib/harness/tools/tool-registry";

const amount = (r: ReturnType<typeof computeAcquisitionCosts>, item: string) => r.items.find(i => i.item.startsWith(item))?.amount;

test("acquisition costs: ₱7.6M Pasig condo, individual seller", () => {
  const r = computeAcquisitionCosts({ sellingPrice: 7_600_000, lguType: "city_or_metro_manila" });
  assert.equal(amount(r, "Capital Gains"), 456_000);
  assert.equal(amount(r, "Documentary Stamp"), 114_000);
  assert.equal(amount(r, "Local Transfer"), 57_000);
  assert.equal(amount(r, "Registration"), 19_000);
  assert.equal(r.totals.seller, 456_000);
  assert.equal(r.totals.buyer, 190_000);
});

test("acquisition costs use the higher zonal value as tax base", () => {
  const r = computeAcquisitionCosts({ sellingPrice: 5_000_000, zonalValue: 6_000_000, lguType: "province" });
  assert.equal(r.taxBaseSource, "BIR zonal value");
  assert.equal(amount(r, "Capital Gains"), 360_000);
  assert.equal(amount(r, "Local Transfer"), 30_000);
});

test("developer sale skips CGT and warns", () => {
  const r = computeAcquisitionCosts({ sellingPrice: 4_300_000, lguType: "city_or_metro_manila", sellerType: "dealer_or_developer" });
  assert.equal(amount(r, "Capital Gains"), undefined);
  assert.ok(r.warnings.some(w => w.includes("dealer")));
});

test("amortization: ₱6.08M at 7% for 20 years", () => {
  const r = computeLoanAmortization({ propertyPrice: 7_600_000, downPaymentPercent: 20, annualInterestRatePercent: 7, termYears: 20, monthlyGrossIncome: 150_000 });
  assert.equal(r.loanAmount, 6_080_000);
  assert.equal(r.monthlyPayment, 47_138.18);
  assert.equal(r.affordability?.withinGuideline, true);
});

test("amortization flags loans above the Pag-IBIG ceiling", () => {
  const r = computeLoanAmortization({ propertyPrice: 15_000_000, downPaymentPercent: 10, annualInterestRatePercent: 6, termYears: 30, lender: "pagibig" });
  assert.ok(r.warnings.some(w => w.includes("Pag-IBIG ceiling")));
});

test("Maceda refund tiers", () => {
  assert.equal(computeMacedaRefund({ totalPaymentsMade: 500_000, yearsOfInstallmentsPaid: 1.5 }).refundPercent, 0);
  assert.equal(computeMacedaRefund({ totalPaymentsMade: 500_000, yearsOfInstallmentsPaid: 3 }).cashSurrenderValue, 250_000);
  assert.equal(computeMacedaRefund({ totalPaymentsMade: 900_000, yearsOfInstallmentsPaid: 6 }).refundPercent, 55);
  assert.equal(computeMacedaRefund({ totalPaymentsMade: 1_000_000, yearsOfInstallmentsPaid: 20 }).refundPercent, 90);
});

test("commission with VAT, EWT and split", () => {
  const r = computeCommission({ salePrice: 9_800_000, commissionRatePercent: 5, isVatRegistered: true, salespersonSharePercent: 40 });
  assert.equal(r.grossCommission, 490_000);
  assert.equal(r.vat, 58_800);
  assert.equal(r.withholdingTax, 24_500);
  assert.equal(r.netCashReceived, 524_300);
  assert.equal(r.split?.salespersonGross, 196_000);
});

test("foreign ownership rules", () => {
  assert.equal(checkForeignOwnership({ buyerType: "foreign_individual", propertyType: "house_and_lot" }).verdict, "not_allowed");
  assert.equal(checkForeignOwnership({ buyerType: "foreign_individual", propertyType: "condominium" }).verdict, "allowed_with_limit");
  assert.equal(checkForeignOwnership({ buyerType: "dual_citizen", propertyType: "land" }).verdict, "allowed");
});

test("listing search only returns inventory matches", async () => {
  const r = await searchListings({ city: "Pasig", minBedrooms: 2, maxPrice: 8_000_000 });
  assert.deepEqual(r.listings.map(l => l.id), ["DEMO-001", "DEMO-003"]);
  const none = await searchListings({ city: "Davao" });
  assert.equal(none.count, 0);
  assert.ok(none.note);
});

test("registry validates and coerces arguments", async () => {
  const reg = new ToolRegistry();
  const ok = await reg.execute("compute_acquisition_costs", { sellingPrice: "₱7,600,000", lguType: "city_or_metro_manila" });
  assert.equal(ok.ok, true);
  const bad = await reg.execute("compute_acquisition_costs", { sellingPrice: 1000 });
  assert.equal(bad.ok, false);
  assert.match(JSON.stringify(bad.result), /lguType/);
  const unknown = await reg.execute("nope", {});
  assert.equal(unknown.ok, false);
});
