/** Loads the harness demo listings (fictitious, marked "demo") into the database. Safe to run repeatedly. */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { seedDemoListings } = await import("../lib/server/stores/listings");
  const n = await seedDemoListings();
  console.log(`db:seed done: ${n} demo listings checked (existing ids are left as they are).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("db:seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
