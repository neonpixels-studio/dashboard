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

// The webServer boots before this runs, so the allowlist must already hold the
// test user's id; a recreated Clerk user would otherwise 403 every spec with
// no hint why.
function assertTestUserIsOwner(userId: string) {
  const allowedIds = (process.env.NUXT_OWNER_CLERK_USER_IDS ?? "")
    .split(",")
    .map((allowedId) => allowedId.trim());
  if (allowedIds.includes(userId)) {
    return;
  }
  throw new Error(
    `E2E Clerk user ${userId} is not in NUXT_OWNER_CLERK_USER_IDS. Run: npx dotenvx set NUXT_OWNER_CLERK_USER_IDS "${userId}" -f .env.e2e`,
  );
}

export default async function globalSetup() {
  console.log("\n[e2e setup] Running migrations...");
  await runMigrations();

  console.log("[e2e setup] Ensuring Clerk test user exists...");
  const testUser = await getOrCreateTestClerkUser();
  assertTestUserIsOwner(testUser.id);

  // Auth storageState is created by the "setup" test project after the
  // webServer is running (see e2e/auth.setup.ts).
  console.log("[e2e setup] Done.\n");
}
