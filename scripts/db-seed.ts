/** Loads the harness's 8 fictitious demo listings (source "demo") into the listings database. Safe to run repeatedly. */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { seedDemoListings } = await import("../lib/listings/import");
  const n = await seedDemoListings();
  console.log(`db:seed done: ${n} demo listings checked (existing codes are left as they are).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("db:seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
