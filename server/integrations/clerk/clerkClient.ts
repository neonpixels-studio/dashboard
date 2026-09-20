import { createClerkClient } from "@clerk/backend";
import type { ClerkClient } from "@clerk/backend";
import type {
  ClerkUserCountRequest,
  ClerkUserCountResponse,
  GetClerkUserCount,
} from "./types";

// The new-users delta only needs the user-list endpoint's `totalCount`, not
// the rows themselves — this stays at Clerk's minimum page size instead of
// paginating through (or even fetching) a single row of actual user data.
const NEW_USERS_LIST_PAGE_SIZE = 1;

// Only the subset of the real Clerk client this package calls — narrowing
// the parameter type (rather than the full `ClerkClient` type) is what makes
// `createClerkUserCountGetter` accept a lightweight test double instead of a
// real client built from a real secret key. Mirrors
// server/integrations/stripe/stripeClient.ts's StripeSubscriptionsClient.
type ClerkUsersClient = Pick<ClerkClient, "users">;

async function fetchTotalUserCount(
  clerkClient: ClerkUsersClient,
): Promise<ClerkUserCountResponse> {
  const totalCount = await clerkClient.users.getCount();
  return { totalCount };
}

async function fetchNewUserCount(
  clerkClient: ClerkUsersClient,
  createdAtAfter: number,
): Promise<ClerkUserCountResponse> {
  const page = await clerkClient.users.getUserList({
    createdAtAfter,
    limit: NEW_USERS_LIST_PAGE_SIZE,
  });
  return { totalCount: page.totalCount };
}

/**
 * Builds the real, network-touching `GetClerkUserCount`. `clerkClient`
 * defaults to a real `@clerk/backend` client built from `secretKey` but is
 * injectable — this is the one function in server/integrations/clerk that
 * would otherwise construct a live client with no seam, unlike every other
 * function in this package (mapping.ts, provider.ts), which already takes a
 * `GetClerkUserCount` as a parameter and is tested against a fixture-backed
 * fake.
 *
 * Unlike GA4's shared studio-wide service account (see ga4Client.ts's
 * per-credential client cache), every Clerk secret key here is a distinct
 * per-app instance, so there's no cross-call reuse to memoize — a fresh
 * client per call, same precedent as
 * server/integrations/stripe/stripeClient.ts's `createStripeSubscriptionLister`.
 *
 * Which of the two real `UserAPI` methods this calls depends on the
 * request: `request.createdAtAfter` set -> the paginated user-list endpoint,
 * scoped to that window (`totalCount` only, `limit: 1` so actual user rows
 * are never fetched); unset -> the dedicated, cheaper total-count endpoint.
 */
export function createClerkUserCountGetter(
  secretKey: string,
  clerkClient: ClerkUsersClient = createClerkClient({ secretKey }),
): GetClerkUserCount {
  return async (
    request: ClerkUserCountRequest,
  ): Promise<ClerkUserCountResponse> => {
    if (request.createdAtAfter !== undefined) {
      return fetchNewUserCount(clerkClient, request.createdAtAfter);
    }
    return fetchTotalUserCount(clerkClient);
  };
}
