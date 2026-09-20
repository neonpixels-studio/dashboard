// Standalone script (run via `npm run db:seed`), not a Nitro handler — it
// runs outside the Nuxt runtime, so it builds its own DB client from
// `process.env.DATABASE_URL` rather than the `useDb()`/`useRuntimeConfig()`
// helpers those handlers use.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { APPS } from "../../app/config/apps";
import * as schema from "./schema";
import { buildIntegrationConfigSeed } from "./seedData";

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run the seed script");
  }
  return databaseUrl;
}

async function seedIntegrationConfig(
  db: ReturnType<typeof drizzle<typeof schema>>,
): Promise<number> {
  const rows = buildIntegrationConfigSeed(APPS);
  await db
    .insert(schema.integrationConfig)
    .values(rows)
    .onConflictDoNothing({
      target: [schema.integrationConfig.slug, schema.integrationConfig.vendor],
    });
  return rows.length;
}

async function main(): Promise<void> {
  const db = drizzle(neon(requireDatabaseUrl()), { schema });
  const seededCount = await seedIntegrationConfig(db);
  console.log(`Seeded ${seededCount} integration_config row(s).`);
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
