// Checks run on every final reply. They add notices rather than rewrite the model's answer,
// so the agent always sees what the model said plus what the harness flagged.

import type { HarnessTurnResult } from "./types";

const COMPUTE_TOOLS = ["compute_acquisition_costs", "compute_loan_amortization", "compute_commission", "compute_maceda_refund"];
const SENSITIVE_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "TIN", re: /\b\d{3}-\d{3}-\d{3}(-\d{3,5})?\b/ },
  { label: "bank account or card number", re: /\b(?:\d[ -]?){13,19}\b/ },
];

/** Flags sensitive personal data typed by the user (RA 10173) before it is sent to a model. */
export function screenUserInput(text: string): string[] {
  return SENSITIVE_PATTERNS.filter(p => p.re.test(text)).map(
    p => `Your message looks like it contains a ${p.label}. Avoid sharing ID, TIN or bank numbers with the AI; keep them in secured client records.`,
  );
}

/** Adds notices when peso figures appear without a supporting calculator call. */
export function reviewReply(reply: string, trace: HarnessTurnResult["toolTrace"]): string[] {
  const warnings: string[] = [];
  const usedCompute = trace.some(t => COMPUTE_TOOLS.includes(t.name));
  const mentionsTaxOrPayment = /(capital gains|documentary stamp|transfer tax|amortization|monthly payment|commission|refund)/i.test(reply);
  if (mentionsTaxOrPayment && /₱\s?\d/.test(reply) && !usedCompute) {
    warnings.push("This reply contains peso figures that were not produced by a harness calculator. Verify them before sending to a client.");
  }
  return warnings;
}
