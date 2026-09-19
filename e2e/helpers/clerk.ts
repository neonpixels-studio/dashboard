import { createClerkClient } from "@clerk/backend";

// A dedicated test user provisioned automatically via the Clerk Backend API.
// No separate Clerk account or credential env vars are needed — the app's
// existing NUXT_CLERK_SECRET_KEY is enough to create and sign in as this user.
export const TEST_USER_EMAIL = "e2e+clerk_test@dashboard.dev";
export const TEST_USER_PASSWORD = "E2eTestPass1!";

function clerkClient() {
  const secretKey = process.env.NUXT_CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("NUXT_CLERK_SECRET_KEY is not set");
  }
  return createClerkClient({ secretKey });
}

export async function getOrCreateTestClerkUser() {
  const clerk = clerkClient();

  const { data: existing } = await clerk.users.getUserList({
    emailAddress: [TEST_USER_EMAIL],
  });

  if (existing.length > 0) {
    return existing[0];
  }

  return clerk.users.createUser({
    emailAddress: [TEST_USER_EMAIL],
    password: TEST_USER_PASSWORD,
    firstName: "E2E",
    lastName: "Test",
    skipPasswordChecks: true,
  });
}
