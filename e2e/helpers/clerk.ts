import { createClerkClient } from "@clerk/backend";
import { isClerkAPIResponseError } from "@clerk/backend/errors";

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

async function findTestClerkUser(clerk: ReturnType<typeof clerkClient>) {
  const { data: matches } = await clerk.users.getUserList({
    emailAddress: [TEST_USER_EMAIL],
  });
  return matches[0];
}

// CI runs multiple e2e matrix shards in parallel (see .github/workflows/
// ci.yml's `e2e` job), each calling this from its own globalSetup within
// seconds of the others. `getOrCreateTestClerkUser`'s lookup is
// check-then-create with no locking, so more than one shard can see no
// existing user and race to create it; Clerk accepts the first and rejects
// the rest with this "form_identifier_exists" error.
function isIdentifierExistsError(error: unknown) {
  return (
    isClerkAPIResponseError(error) &&
    error.errors.some((apiError) => apiError.code === "form_identifier_exists")
  );
}

export async function getOrCreateTestClerkUser() {
  const clerk = clerkClient();

  const existing = await findTestClerkUser(clerk);
  if (existing) {
    return existing;
  }

  try {
    return await clerk.users.createUser({
      emailAddress: [TEST_USER_EMAIL],
      password: TEST_USER_PASSWORD,
      firstName: "E2E",
      lastName: "Test",
      skipPasswordChecks: true,
    });
  } catch (error) {
    // Only recover from the lost half of the create race above — any other
    // error (bad credentials, Clerk outage, a real validation failure) is a
    // genuine failure and must still throw, not get masked by an empty
    // re-fetch or silently swallowed.
    if (!isIdentifierExistsError(error)) {
      throw error;
    }
    // Clerk just confirmed the identifier exists, so a re-fetch coming back
    // empty is read-after-write lag on the list endpoint, not a real
    // absence — retry a few times before giving up, rather than rethrowing
    // on the first miss and pointing the reader at the wrong cause.
    const racedCreation = await findTestClerkUserWithRetry(clerk);
    if (!racedCreation) {
      throw new Error(
        `Clerk reported ${TEST_USER_EMAIL} already exists, but it was not returned by getUserList after retrying`,
        { cause: error },
      );
    }
    return racedCreation;
  }
}

async function findTestClerkUserWithRetry(
  clerk: ReturnType<typeof clerkClient>,
  attempts = 5,
  baseDelayMs = 500,
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const found = await findTestClerkUser(clerk);
    if (found) {
      return found;
    }
    if (attempt < attempts) {
      // Exponential, not fixed: three CI shards can hit getUserList within
      // seconds of each other (see the comment above isIdentifierExistsError),
      // and a fixed 500ms delay only gave this ~1s total to clear read-after-
      // write lag before giving up.
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)),
      );
    }
  }
  return undefined;
}
