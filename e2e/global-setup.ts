import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { getOrCreateTestClerkUser } from "./helpers/clerk";

async function runMigrations(databaseUrl: string) {
  const database = drizzle(neon(databaseUrl));
  const migrationsFolder = fileURLToPath(
    new URL("../server/db/migrations", import.meta.url),
  );
  await migrate(database, { migrationsFolder });
}

export default async function globalSetup() {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("E2E_DATABASE_URL is not set");
  }

  console.log("\n[e2e setup] Running migrations...");
  await runMigrations(databaseUrl);

  console.log("[e2e setup] Ensuring Clerk test user exists...");
  await getOrCreateTestClerkUser();

  // Auth storageState is created by the "setup" test project after the
  // webServer is running (see e2e/auth.setup.ts).
  console.log("[e2e setup] Done.\n");
}
