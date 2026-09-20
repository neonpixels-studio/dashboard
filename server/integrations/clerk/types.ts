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
 * `createdAtAfter` scopes the count to users created at/after this epoch-ms
 * timestamp — the reporting window for the new-users delta. Omitted
 * entirely (not just `undefined`) for the total-users count: Clerk has no
 * single endpoint that both counts users AND filters by creation date, so
 * clerkClient.ts's real implementation picks which underlying endpoint to
 * call based on whether this is set (see its own comment).
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
