import { describe, expect, it } from "vitest";
import { parseAmounts, routeMessage } from "@/lib/harness/providers/demo";

describe("demo provider routing", () => {
  it("parses peso amounts", () => {
    expect(parseAmounts("₱7.6M")).toEqual([7_600_000]);
    expect(parseAmounts("7,600,000 and 900K")).toEqual([7_600_000, 900_000]);
  });
  it("routes common questions to the right calculator", () => {
    expect(routeMessage("Cost to buy a ₱7.6M condo in Pasig?")?.name).toBe("compute_acquisition_costs");
    expect(routeMessage("Monthly payment on ₱7.6M, 20% down, 7%, 20 years")).toEqual({
      name: "compute_loan_amortization",
      arguments: { propertyPrice: 7_600_000, downPaymentPercent: 20, annualInterestRatePercent: 7, termYears: 20, lender: "bank" },
    });
    expect(routeMessage("Commission on ₱9.8M at 5%")?.arguments).toEqual({ salePrice: 9_800_000, commissionRatePercent: 5 });
    expect(routeMessage("Can a Japanese client buy a condo?")?.name).toBe("check_foreign_ownership");
    expect(routeMessage("2BR condos in Pasig under ₱8M")?.arguments).toEqual({ kind: "condominium-unit", city: "Pasig", minBedrooms: 2, maxPrice: 8_000_000, limit: 5 });
    expect(routeMessage("How many listings do we have?")?.name).toBe("get_listing_index");
    expect(routeMessage("Tell me about GRID_6637409546")).toEqual({ name: "get_listing", arguments: { code: "GRID_6637409546" } });
    expect(routeMessage("hello")).toBeNull();
  });
});
