import { test, expect } from "@playwright/test";

// Runs in the "unauthenticated" project, which executes BEFORE auth.setup.ts
// creates a Clerk session.
test.describe("Auth guards (unauthenticated)", () => {
  test("visiting / redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("visiting /login stays on /login", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("GET /api/me is rejected with a 401", async ({ page }) => {
    const response = await page.request.get("/api/me");
    expect(response.status()).toBe(401);
  });
});
