import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "E2E_DATABASE_URL or DATABASE_URL is required for Drizzle; please set one in your environment",
  );
}

export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
});
