// Registry of every harness tool. Add a tool here and every provider can use it automatically.

import type { ToolDefinition } from "../harness/types";
import { checkForeignOwnershipTool } from "./check-foreign-ownership";
import { computeAcquisitionCostsTool } from "./compute-acquisition-costs";
import { computeCommissionTool } from "./compute-commission";
import { computeLoanAmortizationTool } from "./compute-loan-amortization";
import { compareMortgageLendersTool } from "./compare-mortgage-lenders";
import { computeMacedaRefundTool } from "./compute-maceda-refund";
import { getDocumentChecklistTool, getRuleTopicTool } from "./lookup-tools";
import { getListingIndexTool, getListingTool, searchListingsTool } from "./search-listings";
import { ToolArgumentError, validateArguments, type HarnessTool } from "./tool-types";

export class ToolRegistry {
  private readonly tools = new Map<string, HarnessTool<any>>();

  constructor(tools: HarnessTool<any>[] = DEFAULT_TOOLS) {
    for (const t of tools) this.register(t);
  }

  register(tool: HarnessTool<any>): void {
    this.tools.set(tool.definition.name, tool);
  }

  definitions(): ToolDefinition[] {
    return [...this.tools.values()].map(t => t.definition);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Validates and runs a tool. Errors are returned as data (not thrown) so the model can
   * read the message and correct its arguments on the next step.
   */
  async execute(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; result: unknown }> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, result: { error: `Unknown tool "${name}".` } };
    try {
      const clean = validateArguments(tool.definition.parameters, args ?? {});
      return { ok: true, result: await tool.run(clean) };
    } catch (err) {
      const message = err instanceof ToolArgumentError ? err.message : `Tool failed: ${(err as Error).message}`;
      return { ok: false, result: { error: message } };
    }
  }
}

export const DEFAULT_TOOLS: HarnessTool<any>[] = [
  computeAcquisitionCostsTool,
  computeLoanAmortizationTool,
  compareMortgageLendersTool,
  computeCommissionTool,
  computeMacedaRefundTool,
  checkForeignOwnershipTool,
  searchListingsTool,
  getListingIndexTool,
  getListingTool,
  getDocumentChecklistTool,
  getRuleTopicTool,
];
