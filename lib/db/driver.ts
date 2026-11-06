/**
 * Which Postgres client to use for a connection string.
 *  - Neon (host *.neon.tech): Neon's serverless driver (WebSockets), best on Netlify/Vercel functions.
 *  - Any other PostgreSQL (DigitalOcean Managed, AWS RDS, Supabase, a VPS or Docker): node-postgres.
 * DB_DRIVER=neon | pg forces one. DATABASE_SSL=no-verify accepts a provider's self-signed certificate
 * (or set PGSSLROOTCERT / sslrootcert to the provider's CA file instead, which is safer).
 */
export function isPlainPostgres(url: string) {
  const forced = process.env.DB_DRIVER;
  if (forced === "pg") return true;
  if (forced === "neon") return false;
  try {
    return !new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return true;
  }
}

/** node-postgres pool options for a URL (handles DATABASE_SSL=no-verify). */
export function pgOptions(url: string, max: number) {
  if (process.env.DATABASE_SSL !== "no-verify") return { connectionString: url, max };
  const u = new URL(url);
  u.searchParams.delete("sslmode");
  return { connectionString: u.toString(), max, ssl: { rejectUnauthorized: false } };
}
