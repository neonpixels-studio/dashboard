import { defineConfig, devices } from "@playwright/test";

// Env is injected by dotenvx before Playwright starts (see the "e2e" npm
// scripts: `dotenvx run -f .env.e2e -- playwright test`).

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/artifacts",
  reporter: [["html", { outputFolder: "e2e/report" }]],
  use: {
    baseURL: "http://localhost:3002",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // dev:test is a raw `nuxt dev` (no dotenvx) — env comes from the dotenvx run
    // that started Playwright, merged with the pins below.
    command: "npm run dev:test -- --port 3002",
    url: "http://localhost:3002",
    reuseExistingServer: !process.env.CI,
  },
});
