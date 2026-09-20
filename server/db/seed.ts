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

interface SeedResult {
  attempted: number;
  inserted: number;
}

async function seedIntegrationConfig(
  db: ReturnType<typeof drizzle<typeof schema>>,
): Promise<SeedResult> {
  const rows = buildIntegrationConfigSeed(APPS);
  if (!rows.length) {
    return { attempted: 0, inserted: 0 };
  }

  const insertedRows = await db
    .insert(schema.integrationConfig)
    .values(rows)
    .onConflictDoNothing({
      target: [schema.integrationConfig.slug, schema.integrationConfig.vendor],
    })
    .returning({ id: schema.integrationConfig.id });
  return { attempted: rows.length, inserted: insertedRows.length };
}

async function main(): Promise<void> {
  const db = drizzle(neon(requireDatabaseUrl()), { schema });
  const { attempted, inserted } = await seedIntegrationConfig(db);
  console.log(
    `Seeded ${inserted} of ${attempted} integration_config row(s) (rest already present).`,
  );
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
