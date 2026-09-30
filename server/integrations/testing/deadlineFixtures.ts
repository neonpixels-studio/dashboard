import type { FetchDeadline } from "../types";

// Shared test-only FetchDeadline builders — used across the GA4/Stripe
// client tests (a deadline with some time left, to assert the clamped
// timeout) and the Sentry/GA4/Stripe/DEV.to/Hashnode/Medium provider wiring
// tests (an already-exhausted deadline, to prove the provider actually
// threads its `deadline` argument down to the real client rather than
// silently dropping it) instead of each redeclaring the same minimal
// FetchDeadline shape (rule of three: same concern, many copies before this
// existed). Lives alongside hangingFetch.ts/httpFixtures.ts/loadFixture.ts/
// testConfig.ts as this package's other test-support seams.

/**
 * A deadline with `remainingMs` ms left and a signal that never aborts on
 * its own — for asserting a client clamps its own fixed timeout down to
 * whatever's left of the shared budget.
 */
export function createDeadline(remainingMs: number): FetchDeadline {
  return {
    signal: new AbortController().signal,
    remainingMs: () => remainingMs,
  };
}

/**
 * A deadline that's already spent: `remainingMs()` is 0 and `signal` is
 * already aborted — for asserting a provider actually threads its
 * `deadline` argument through to the real client (which should then fail
 * fast / abort immediately) rather than silently ignoring it.
 */
export function createExhaustedDeadline(): FetchDeadline {
  const controller = new AbortController();
  controller.abort(new Error("shared run budget already exhausted (test)"));
  return {
    signal: controller.signal,
    remainingMs: () => 0,
  };
}
