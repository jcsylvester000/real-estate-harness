import cwv from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";

const config = [
  ...cwv,
  ...ts,
  // Ported harness: provider adapters map raw vendor JSON, so they keep `any` at those edges.
  { files: ["lib/harness/**", "tests/harness/**"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
  // grid.js is a plain browser script shipped as-is to third-party apps.
  { ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "public/**"] },
];
export default config;
