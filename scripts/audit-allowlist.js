// Documented allowlist of dependency advisories the `dependency-audit` CI gate
// tolerates. The gate fails on any high/critical advisory NOT listed here, so a
// newly introduced vulnerability still breaks the build.
//
// Every entry must have a documented "no non-breaking fix available"
// justification in its `reason`. Periodic re-evaluation is forced by the single
// shared `ALLOWLIST_REVIEW_BY` date below: once it passes, the gate fails until
// every entry is re-reviewed (for an upstream fix) and the date is bumped.
//
// Add an entry here only when a high/critical advisory has no non-breaking fix
// available.

export const ALLOWLIST_REVIEW_BY = "2026-12-27";

const SIMPLE_GIT_DEVTOOLS_RATIONALE =
  "Reached only via nuxt > @nuxt/devtools > simple-git, the Nuxt devtools " +
  "Git integration that runs only under `nuxt dev` and is never bundled " +
  "into the deployed Netlify output. No non-breaking fix: the patched " +
  "simple-git 4.x drops the default export that @nuxt/devtools@3.4.2 " +
  "imports (`import Git from 'simple-git'`), so an override breaks `nuxt " +
  "prepare` (verified 2026-10-07); the only @nuxt/devtools release without " +
  "it is 4.0.0-beta.4 and nuxt@4.6.0 still pins ^3.4.2. Unreachability " +
  "verified 2026-10-07 via `grep -rniE 'simple-git' server app shared " +
  "netlify scripts` - no dashboard-owned call sites. Re-check for a devtools release " +
  "supporting simple-git 4 by ALLOWLIST_REVIEW_BY.";

// `packages` lists the exact npm package name(s) the advisory is filed against
// (matched against `via.name` from `npm audit`). The gate only suppresses an
// advisory when BOTH its ID and the affected package match an entry — so if a
// "dev-only" package later moves into the production path under a different
// name, the suppression no longer applies and the gate fails as intended.
/** @type {Array<{ id: string, packages: string[], reason: string }>} */
export const ALLOWED_ADVISORIES = [
  {
    id: "GHSA-vfj7-8cjw-p6xm",
    packages: ["braces"],
    reason:
      "braces stack-exhaustion DoS via deeply nested patterns. No patched release " +
      "exists: latest published braces is 3.0.3 and the advisory range is <=3.0.3, " +
      "so no override can resolve it. Reached only via " +
      "nuxt > @nuxt/nitro-server > nitropack > globby > micromatch > braces, i.e. " +
      "build-time globbing over our own source tree; nitropack is not part of the " +
      "deployed server output and no dashboard code expands user-supplied patterns. " +
      "Unreachability verified 2026-10-04 via " +
      "`grep -rniE 'braces|micromatch|globby' server app shared netlify scripts` — " +
      "no dashboard-owned call sites. Re-check for a braces patch by ALLOWLIST_REVIEW_BY.",
  },
  {
    id: "GHSA-86w9-cpqp-85rv",
    packages: ["node-forge"],
    reason:
      "node-forge RSA PKCS#1 v1.5 signature verification accepts extra nested " +
      "DigestAlgorithm elements. No patched release exists: latest published " +
      "node-forge is 1.4.0 and the advisory range is <=1.4.0; npm's only 'fix' is a " +
      "semver-major downgrade to nuxt@3.15.1. Reached only via " +
      "nuxt > @nuxt/cli > listhen > node-forge, which generates the local dev " +
      "server's self-signed HTTPS cert — never loaded by the deployed Netlify " +
      "functions, and no dashboard code verifies RSA signatures with it. " +
      "Unreachability verified 2026-10-04 via " +
      "`grep -rniE 'node-forge|listhen' server app shared netlify scripts` — " +
      "no dashboard-owned call sites. Re-check for a node-forge patch by ALLOWLIST_REVIEW_BY.",
  },
  {
    id: "GHSA-v5rq-49vh-5v5c",
    packages: ["@simple-git/argv-parser"],
    reason:
      "@simple-git/argv-parser omits the VISUAL editor variable from unsafe editor detection (fixed in 2.0.1, which only simple-git 4 consumes). " +
      SIMPLE_GIT_DEVTOOLS_RATIONALE,
  },
  {
    id: "GHSA-x6jw-m9v5-85vh",
    packages: ["simple-git"],
    reason:
      "simple-git unsafe-operation guard does not block trailer command configuration (fixed in 4.0.2). " +
      SIMPLE_GIT_DEVTOOLS_RATIONALE,
  },
  {
    id: "GHSA-g4wm-2vf7-vfgr",
    packages: ["simple-git"],
    reason:
      "simple-git allows command execution through unblocked Git configuration includes (fixed in 4.0.2). " +
      SIMPLE_GIT_DEVTOOLS_RATIONALE,
  },
  {
    id: "GHSA-858h-whjf-mvg5",
    packages: ["simple-git"],
    reason:
      "simple-git unsafe-operations plugin bypass via git long-option abbreviation (fixed in 4.0.2). " +
      SIMPLE_GIT_DEVTOOLS_RATIONALE,
  },
];

// Single source of truth for the id::package key format, so the allowlist
// lookup (below), the gate's dedupe/suppression logic, and the stale-entry
// check in scripts/audit-gate.js all key advisories the same way. Exported so
// every one of those call sites can build the identical key instead of
// re-deriving the `::` join format independently and risking drift.
export function advisoryKey(advisoryId, packageName) {
  return `${advisoryId}::${packageName}`;
}

// Builds an id::package lookup from a list of allowlist entries. Exported (not
// just the module-level `isAdvisoryAllowed` singleton below) so tests can
// exercise the real key-construction/matching logic against a fixture entry
// list, instead of reimplementing the match with an ad hoc predicate that
// could silently drift out of sync with this format.
export function createAllowlistLookup(entries) {
  const allowedKeys = new Set(
    entries.flatMap((advisory) =>
      advisory.packages.map((packageName) =>
        advisoryKey(advisory.id, packageName),
      ),
    ),
  );
  // An advisory is suppressed only when its ID AND affected package both match
  // an allowlist entry, so a justification tied to where a package sits in the
  // tree stops applying if a different package later trips the same advisory ID.
  return function isAdvisoryAllowed(advisoryId, packageName) {
    return allowedKeys.has(advisoryKey(advisoryId, packageName));
  };
}

export const isAdvisoryAllowed = createAllowlistLookup(ALLOWED_ADVISORIES);
