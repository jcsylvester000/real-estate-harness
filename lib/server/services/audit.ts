import { getDb, type DB } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

/** Records a security-relevant action. Never pass secrets or customer personal data in detail. */
export async function audit(userId: string | null, action: string, detail: Record<string, unknown> = {}, db?: DB) {
  const d = db ?? (await getDb());
  await d.insert(auditLog).values({ userId, action, detail });
}
