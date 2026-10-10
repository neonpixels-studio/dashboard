import { createClerkClient } from "@clerk/backend";
import type { ClerkClient, User } from "@clerk/backend";
import type {
  ClerkUserCountRequest,
  ClerkUserCountResponse,
  ClerkUserScan,
  ClerkUserSummary,
  GetClerkUserCount,
  ScanClerkUsers,
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

// Clerk's maximum page size for the user-list endpoint.
const USER_SCAN_PAGE_SIZE = 500;
// Hard ceiling on pages per sync (5,000 users at 500/page). A bigger
// instance stops early and reports an incomplete scan, which mapping.ts
// turns into omitted metrics rather than numbers extrapolated from a sample.
const USER_SCAN_MAX_PAGES = 10;
const VERIFIED_STATUS = "verified";
const PASSWORD_METHOD = "password";
const PASSWORDLESS_METHOD = "passwordless";
const SSO_METHOD = "sso";
const WEB3_METHOD = "web3";
const OAUTH_PROVIDER_PREFIX = "oauth_";

function hasVerifiedEmail(user: User): boolean {
  return user.emailAddresses.some(
    (emailAddress) => emailAddress.verification?.status === VERIFIED_STATUS,
  );
}

/**
 * One method per user so the split sums to the user total: the first linked
 * social provider if any (`oauth_github` and `github` both normalize to
 * `github`), else enterprise SSO, web3 wallet, password, else passwordless (email code, passkey, ...) —
 * Clerk's user object can't tell those apart from each other.
 */
export function classifySignInMethod(user: User): string {
  const provider = user.externalAccounts[0]?.provider;
  if (provider) {
    return provider.startsWith(OAUTH_PROVIDER_PREFIX)
      ? provider.slice(OAUTH_PROVIDER_PREFIX.length)
      : provider;
  }
  if (user.enterpriseAccounts.length > 0) {
    return SSO_METHOD;
  }
  if (user.web3Wallets.length > 0) {
    return WEB3_METHOD;
  }
  return user.passwordEnabled ? PASSWORD_METHOD : PASSWORDLESS_METHOD;
}

export function summarizeClerkUser(user: User): ClerkUserSummary {
  return {
    createdAt: user.createdAt,
    lastActiveAt: user.lastActiveAt,
    hasVerifiedEmail: hasVerifiedEmail(user),
    signInMethod: classifySignInMethod(user),
  };
}

async function fetchUserPage(clerkClient: ClerkUsersClient, page: number) {
  return clerkClient.users.getUserList({
    limit: USER_SCAN_PAGE_SIZE,
    offset: page * USER_SCAN_PAGE_SIZE,
    orderBy: "+created_at",
  });
}

function isScanFinished(
  scannedCount: number,
  response: { data: unknown[]; totalCount: number },
): boolean {
  return (
    scannedCount >= response.totalCount ||
    response.data.length === 0 ||
    // Over the cap: no later page can make the scan complete, so stop
    // spending Clerk rate-limit budget on rows that will be discarded.
    response.totalCount > USER_SCAN_PAGE_SIZE * USER_SCAN_MAX_PAGES
  );
}

/**
 * Builds the real, network-touching `ScanClerkUsers`: pages through the
 * user list (up to USER_SCAN_MAX_PAGES) and reduces every row to a
 * PII-free summary. Same injectable-client seam as
 * createClerkUserCountGetter.
 *
 * `consistent` only breaks when the total SHRINKS between pages: ordered by
 * created_at, a mid-scan signup lands after every row already read (harmless),
 * while a deletion shifts later rows left and skips a live user.
 */
export function createClerkUserScanner(
  secretKey: string,
  clerkClient: ClerkUsersClient = createClerkClient({ secretKey }),
): ScanClerkUsers {
  return async (): Promise<ClerkUserScan> => {
    const users: ClerkUserSummary[] = [];
    let totalCount = 0;
    let consistent = true;
    for (let page = 0; page < USER_SCAN_MAX_PAGES; page += 1) {
      const response = await fetchUserPage(clerkClient, page);
      consistent = consistent && response.totalCount >= totalCount;
      totalCount = response.totalCount;
      users.push(...response.data.map(summarizeClerkUser));
      if (isScanFinished(users.length, response)) {
        break;
      }
    }
    return { users, totalCount, consistent };
  };
}
