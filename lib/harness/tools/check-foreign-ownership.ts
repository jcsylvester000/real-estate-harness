// Tool: can this buyer own or lease this kind of Philippine property?

import type { HarnessTool } from "./tool-types";

export interface ForeignOwnershipInput {
  buyerType: "filipino" | "dual_citizen" | "former_natural_born_filipino" | "foreign_individual" | "foreign_corporation";
  propertyType: "land" | "house_and_lot" | "condominium" | "lease";
}

/** Rule lookup; returns a verdict with conditions and legal basis. Pure function. */
export function checkForeignOwnership({ buyerType, propertyType }: ForeignOwnershipInput) {
  if (buyerType === "filipino" || buyerType === "dual_citizen") {
    return { verdict: "allowed", conditions: buyerType === "dual_citizen" ? ["Present proof of reacquired citizenship (RA 9225 Identification Certificate)."] : [], basis: ["1987 Constitution Art. XII Sec. 7", "RA 9225"] };
  }
  if (propertyType === "condominium") {
    return {
      verdict: "allowed_with_limit",
      conditions: ["Foreign ownership in the condominium project must stay at or below 40% of units; ask the developer or condo corporation for the current foreign quota.", "Inward remittance of funds is commonly documented for the purchase."],
      basis: ["RA 4726 (Condominium Act) Sec. 5"],
    };
  }
  if (propertyType === "lease") {
    return {
      verdict: "allowed",
      conditions: ["General leases to foreigners: up to 25 years, renewable for 25 years (PD 471).", "Registered foreign investors: up to 99 years in aggregate for the approved investment, registered and annotated on the title (RA 12252, 2025)."],
      basis: ["PD 471", "RA 7652 as amended by RA 12252"],
    };
  }
  if (buyerType === "former_natural_born_filipino") {
    return {
      verdict: "allowed_with_limit",
      conditions: ["Residential use: up to 1,000 sqm urban or 1 hectare rural (BP 185).", "Business use: up to 5,000 sqm urban or 3 hectares rural (RA 8179).", "Or reacquire Filipino citizenship under RA 9225 to remove the limits."],
      basis: ["BP 185", "RA 8179", "RA 9225"],
    };
  }
  return {
    verdict: "not_allowed",
    conditions: [
      "Foreigners and corporations with more than 40% foreign equity cannot own land (or a house and lot including the land).",
      "Alternatives: buy a condominium unit within the 40% quota, own only the building on leased land, or lease long-term.",
    ],
    basis: ["1987 Constitution Art. XII Sec. 7"],
  };
}

export const checkForeignOwnershipTool: HarnessTool<ForeignOwnershipInput> = {
  definition: {
    name: "check_foreign_ownership",
    description: "Check whether a buyer (Filipino, dual citizen, former Filipino, foreigner, foreign corporation) may own or lease a type of Philippine property, with conditions and legal basis.",
    parameters: {
      type: "object",
      properties: {
        buyerType: { type: "string", enum: ["filipino", "dual_citizen", "former_natural_born_filipino", "foreign_individual", "foreign_corporation"] },
        propertyType: { type: "string", enum: ["land", "house_and_lot", "condominium", "lease"] },
      },
      required: ["buyerType", "propertyType"],
    },
  },
  run: checkForeignOwnership,
};
