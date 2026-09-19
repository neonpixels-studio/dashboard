import { test as setup } from "@playwright/test";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { mkdirSync } from "node:fs";
import { TEST_USER_EMAIL } from "./helpers/clerk";

const AUTH_STATE_FILE = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  // clerkSetup() is called here (not in global-setup) so CLERK_TESTING_TOKEN is
  // NOT set before the webServer process starts. If the Nuxt dev server
  // inherited it, Clerk's server middleware would authenticate every request —
  // including the "unauthenticated" test project.
  await clerkSetup();

  // Load the app so Clerk JS can initialize, then sign in via the
  // @clerk/testing helper. It handles setupClerkTestingToken internally, uses a
  // backend-created sign-in token (ticket strategy), and waits for
  // window.Clerk.user to be non-null.
  await page.goto("/login");

  await clerk.signIn({ page, emailAddress: TEST_USER_EMAIL });

  // Hit a protected page to confirm the session is fully established and let
  // any client-side redirects settle before capturing state.
  await page.goto("/dashboard");
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");

  mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: AUTH_STATE_FILE });
});
