// Shared tool contract plus a small argument validator, so tools need no external schema library.

import type { JsonSchema, ToolDefinition } from "../harness/types";

export interface HarnessTool<A = Record<string, unknown>> {
  definition: ToolDefinition;
  run(args: A): unknown | Promise<unknown>;
}

export class ToolArgumentError extends Error {}

/**
 * Checks required fields, primitive types, enums and numeric bounds against the tool schema.
 * Models occasionally send numbers as strings ("7600000"); those are coerced rather than rejected.
 * @returns a cleaned copy of the arguments
 */
export function validateArguments(schema: JsonSchema, args: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  const props = schema.properties ?? {};
  for (const key of schema.required ?? []) {
    if (args[key] === undefined || args[key] === null || args[key] === "") {
      throw new ToolArgumentError(`Missing required argument "${key}".`);
    }
  }
  for (const [key, value] of Object.entries(args)) {
    const prop = props[key];
    if (!prop || value === undefined || value === null) continue;
    clean[key] = coerce(key, prop, value);
  }
  return clean;
}

function coerce(key: string, prop: JsonSchema, value: unknown): unknown {
  if (prop.type === "number" || prop.type === "integer") {
    const n = typeof value === "string" ? Number(value.replace(/[₱,\s]/g, "")) : value;
    if (typeof n !== "number" || !Number.isFinite(n)) throw new ToolArgumentError(`"${key}" must be a number.`);
    if (prop.minimum !== undefined && n < prop.minimum) throw new ToolArgumentError(`"${key}" must be at least ${prop.minimum}.`);
    if (prop.maximum !== undefined && n > prop.maximum) throw new ToolArgumentError(`"${key}" must be at most ${prop.maximum}.`);
    return prop.type === "integer" ? Math.round(n) : n;
  }
  if (prop.type === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "false") return value === "true";
    throw new ToolArgumentError(`"${key}" must be true or false.`);
  }
  if (prop.type === "string") {
    const s = String(value);
    if (prop.enum && !prop.enum.includes(s)) throw new ToolArgumentError(`"${key}" must be one of: ${prop.enum.join(", ")}.`);
    return s;
  }
  return value;
}

/** Rounds to centavos for display-safe peso amounts. */
export const peso = (n: number): number => Math.round(n * 100) / 100;
