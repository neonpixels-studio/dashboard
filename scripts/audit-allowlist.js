// Documented allowlist of dependency advisories the `dependency-audit` CI gate
// tolerates. The gate fails on any high/critical advisory NOT listed here, so a
// newly introduced vulnerability still breaks the build.
//
// Every entry must have a documented "no non-breaking fix available"
// justification in its `reason`. Periodic re-evaluation is forced by the single
// shared `ALLOWLIST_REVIEW_BY` date below: once it passes, the gate fails until
// every entry is re-reviewed (for an upstream fix) and the date is bumped.
//
// Empty as of 2026-09-27 — dashboard currently has no high/critical advisories
// (only moderate, which this gate doesn't block on). Add an entry here only
// when a high/critical advisory has no non-breaking fix available.

export const ALLOWLIST_REVIEW_BY = "2026-12-27";

// `packages` lists the exact npm package name(s) the advisory is filed against
// (matched against `via.name` from `npm audit`). The gate only suppresses an
// advisory when BOTH its ID and the affected package match an entry — so if a
// "dev-only" package later moves into the production path under a different
// name, the suppression no longer applies and the gate fails as intended.
/** @type {Array<{ id: string, packages: string[], reason: string }>} */
export const ALLOWED_ADVISORIES = [];

// Builds an id::package lookup from a list of allowlist entries. Exported (not
// just the module-level `isAdvisoryAllowed` singleton below) so tests can
// exercise the real key-construction/matching logic against a fixture entry
// list, instead of reimplementing the match with an ad hoc predicate that
// could silently drift out of sync with this format.
export function createAllowlistLookup(entries) {
  const allowedKeys = new Set(
    entries.flatMap((advisory) =>
      advisory.packages.map((packageName) => `${advisory.id}::${packageName}`),
    ),
  );
  // An advisory is suppressed only when its ID AND affected package both match
  // an allowlist entry, so a justification tied to where a package sits in the
  // tree stops applying if a different package later trips the same advisory ID.
  return function isAdvisoryAllowed(advisoryId, packageName) {
    return allowedKeys.has(`${advisoryId}::${packageName}`);
  };
}

export const isAdvisoryAllowed = createAllowlistLookup(ALLOWED_ADVISORIES);
