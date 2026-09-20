// Standalone script (run via `npm run db:seed`), not a Nitro handler — it
// runs outside the Nuxt runtime, so it builds its own DB client from
// `process.env.DATABASE_URL` rather than the `useDb()`/`useRuntimeConfig()`
// helpers those handlers use.
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { APPS } from "../../app/config/apps";
import * as schema from "./schema";
import {
  buildIntegrationConfigSeed,
  type IntegrationConfigSeedRow,
} from "./seedData";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run the seed script");
  }
  return databaseUrl;
}

export interface SeedResult {
  attempted: number;
  inserted: number;
}

// Takes `rows` rather than deriving them from `APPS` internally, so the
// insert path is testable against a fake `db` and fixture rows without a
// live database.
export async function seedIntegrationConfig(
  db: DrizzleDb,
  rows: IntegrationConfigSeedRow[],
): Promise<SeedResult> {
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
  const { attempted, inserted } = await seedIntegrationConfig(
    db,
    buildIntegrationConfigSeed(APPS),
  );
  console.log(
    `Seeded ${inserted} of ${attempted} integration_config row(s) (rest already present).`,
  );
}

// Only auto-run when executed directly (`npm run db:seed`), not when a test
// imports `seedIntegrationConfig` from this module — the JS/ESM equivalent
// of PHP's `realpath(__FILE__) === realpath($argv[0])` guard.
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  });
}
