import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { getOrCreateTestClerkUser } from "./helpers/clerk";
import { getRawSqlClient } from "./helpers/db";

async function runMigrations() {
  const database = drizzle(getRawSqlClient());
  const migrationsFolder = fileURLToPath(
    new URL("../server/db/migrations", import.meta.url),
  );
  await migrate(database, { migrationsFolder });
}

export default async function globalSetup() {
  console.log("\n[e2e setup] Running migrations...");
  await runMigrations();

  console.log("[e2e setup] Ensuring Clerk test user exists...");
  await getOrCreateTestClerkUser();

  // Auth storageState is created by the "setup" test project after the
  // webServer is running (see e2e/auth.setup.ts).
  console.log("[e2e setup] Done.\n");
}
