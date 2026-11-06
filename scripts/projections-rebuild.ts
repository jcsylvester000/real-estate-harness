/**
 * Rebuilds every listings read model (search table, stats, buyer matches) from the write model.
 * Normally not needed: the projector catches up by itself and rebuilds when its code version changes.
 * Usage: npm run projections:rebuild
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { getListingsDb } = await import("../lib/listings/db");
  const { project } = await import("../lib/listings/projector");
  const { projectionState } = await import("../lib/listings/schema");
  const db = await getListingsDb("write");
  await db.update(projectionState).set({ schemaVersion: -1 });
  const started = Date.now();
  const v = await project(db);
  console.log(`projections:rebuild done in ${Date.now() - started} ms (read-model version ${v}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("projections:rebuild failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
