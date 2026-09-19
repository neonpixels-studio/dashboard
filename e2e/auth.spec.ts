import { test, expect } from "@playwright/test";

test.describe("Auth guards (authenticated)", () => {
  test("/dashboard is reachable with a session", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("/login redirects a signed-in user to /dashboard", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  // The only check that covers the whole chain against real infrastructure:
  // Clerk verifies the session cookie, the Nitro middleware upserts the row via
  // Drizzle, and the handler reads it back.
  test("GET /api/me returns the row created for the Clerk identity", async ({
    page,
  }) => {
    const response = await page.request.get("/api/me");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.id).toEqual(expect.any(Number));
    expect(body.createdAt).toBeTruthy();
    // The Clerk user id must not leak out of the API.
    expect(body).not.toHaveProperty("providerId");
  });
});
