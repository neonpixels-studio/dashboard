export const CLERK_VENDOR = "clerk";

// Plain, JSON-serializable subset of what this provider needs from Clerk's
// Backend API. Deliberately NOT the raw `@clerk/backend` `UserAPI` return
// types: `getCount()` resolves a bare `number`, while `getUserList()`
// resolves a `PaginatedResourceResponse` (`data` + `totalCount`) — two
// different shapes for what this provider treats as the same kind of
// question ("how many users match?"). clerkClient.ts is the one place that
// normalizes both into this one response shape; mapping.ts and provider.ts
// (and their tests) only ever see this file's types, and test fixtures are
// recorded directly in this shape. Mirrors server/integrations/stripe/types.ts's
// StripeSubscriptionPage / server/integrations/ga4/types.ts's Ga4ReportRow
// split.
export interface ClerkUserCountResponse {
  totalCount: number;
}

/**
 * `createdAtAfter` scopes the count to users created after this epoch-ms
 * timestamp (matching the real `UserListParams.createdAtAfter` field this
 * maps onto — see clerkClient.ts) — the reporting window for the new-users
 * delta. Omitted (or explicitly `undefined` — both are treated identically,
 * see clerkClient.ts's `!== undefined` check) for the total-users count:
 * Clerk has no single endpoint that both counts users AND filters by
 * creation date, so clerkClient.ts's real implementation picks which
 * underlying endpoint to call based on whether this is set (see its own
 * comment).
 */
export interface ClerkUserCountRequest {
  createdAtAfter?: number;
}

// The seam every pure function in this package is tested against instead of
// a real Clerk client: `createClerkUserCountGetter` (clerkClient.ts) builds
// the real implementation; provider unit tests substitute a fixture-backed
// fake with the same signature and never touch the network.
export type GetClerkUserCount = (
  request: ClerkUserCountRequest,
) => Promise<ClerkUserCountResponse>;

// One user reduced to the only fields the auth-panel metrics need — no PII
// (names, emails, ids) ever leaves clerkClient.ts. `signInMethod` is one
// classification per user (see clerkClient.ts's classifySignInMethod) so the
// per-method counts sum to the scanned total.
export interface ClerkUserSummary {
  createdAt: number;
  lastActiveAt: number | null;
  hasVerifiedEmail: boolean;
  signInMethod: string;
}

// `totalCount` is Clerk's own count for the listing; `users.length` is how
// many rows were actually paged in. They differ when the scan hit its page
// cap (or users changed mid-scan), and mapping.ts treats any mismatch as an
// incomplete scan — scan-derived metrics are then omitted, not extrapolated.
// `consistent` is false when `totalCount` changed between pages: with
// offset paging a mid-scan deletion shifts later rows left, silently
// skipping a live user while the shrunken total still matches the row count.
export interface ClerkUserScan {
  users: ClerkUserSummary[];
  totalCount: number;
  consistent: boolean;
}

export type ScanClerkUsers = () => Promise<ClerkUserScan>;
