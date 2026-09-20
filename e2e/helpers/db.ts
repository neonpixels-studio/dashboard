import { neon } from "@neondatabase/serverless";

// Single point of contact with the e2e database's connection string, so
// there's one place that resolves `E2E_DATABASE_URL` and one error message
// when it's missing, instead of every caller constructing its own `neon()`
// client. `global-setup.ts` wraps this in Drizzle to run migrations;
// `db-triggers.spec.ts` uses it directly to issue raw SQL that bypasses
// Drizzle entirely.
export function getRawSqlClient() {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("E2E_DATABASE_URL is not set");
  }
  return neon(databaseUrl);
}
