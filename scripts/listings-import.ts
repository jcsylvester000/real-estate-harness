/**
 * Imports a GRID "listings-published" CSV export into the listings database.
 * Usage (PowerShell): npm run listings:import -- "C:\path\to\export.csv"
 * Existing codes are updated, new ones inserted; rows with problems are skipped and listed.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

config({ path: ".env.local" });

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Give the CSV path: npm run listings:import -- "C:\\path\\to\\export.csv"');
  const { getListingsDb } = await import("../lib/listings/db");
  const { importGridCsv } = await import("../lib/listings/import");
  const started = Date.now();
  const s = await importGridCsv(await getListingsDb(), { fileName: basename(file), csv: readFileSync(file, "utf8") });
  console.log(`listings:import ${s.fileName}: ${s.rowsTotal} rows · ${s.inserted} new · ${s.updated} updated · ${s.skipped} skipped (${Date.now() - started} ms)`);
  for (const p of s.problems) console.log(`  row ${p.row} ${p.code || "(no code)"}: ${p.reason}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("listings:import failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
