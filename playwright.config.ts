import { defineConfig, devices } from "@playwright/test";

// Env is injected by dotenvx before Playwright starts (see the "e2e" npm
// scripts: `dotenvx run -f .env.e2e -- playwright test`).

// @clerk/testing requires the standard CLERK_* names; map from Nuxt conventions.
if (!process.env.CLERK_SECRET_KEY && process.env.NUXT_CLERK_SECRET_KEY) {
  process.env.CLERK_SECRET_KEY = process.env.NUXT_CLERK_SECRET_KEY;
}
if (
  !process.env.CLERK_PUBLISHABLE_KEY &&
  process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY
) {
  process.env.CLERK_PUBLISHABLE_KEY =
    process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "";
const UNAUTHENTICATED_SPECS = [/auth-unauth\.spec\.ts/];

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/artifacts",
  reporter: [["html", { outputFolder: "e2e/report" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3002",
  },
  projects: [
    // Runs first, before any Clerk session exists, so the client route
    // middleware behaves as it would for a real unauthenticated visitor. Clerk's
    // dev FAPI otherwise hands a live session to cookieless browser contexts.
    {
      name: "unauthenticated",
      testMatch: UNAUTHENTICATED_SPECS,
      use: { ...devices["Desktop Chrome"] },
    },
    // Creates e2e/.auth/user.json for the authenticated project below.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      dependencies: ["unauthenticated"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: UNAUTHENTICATED_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
    },
  ],
  webServer: {
    // dev:test is a raw `nuxt dev` (no dotenvx) — env comes from the dotenvx run
    // that started Playwright, merged with the pins below.
    command: "npm run dev:test -- --port 3002",
    url: "http://localhost:3002",
    reuseExistingServer: !process.env.CI,
    env: {
      // Pin the DB to the e2e branch. Nuxt's built-in .env loader would
      // otherwise inject the encrypted (ciphertext) DATABASE_URL from the
      // committed .env and override runtimeConfig.databaseUrl.
      DATABASE_URL: E2E_DATABASE_URL,
      E2E_DATABASE_URL,
      NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
      NUXT_CLERK_SECRET_KEY: process.env.NUXT_CLERK_SECRET_KEY ?? "",
      // Sign-ups must stay enabled so the e2e user can register itself on the
      // fresh database.
      NUXT_DISABLE_SIGNUPS: "",
    },
  },
});
