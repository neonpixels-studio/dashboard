import { describe, it, expect, vi, afterEach } from "vitest";
import {
  advisoryIdFromUrl,
  assertUsableReport,
  collectBlockingAdvisories,
  isAllowlistExpired,
  parseAuditReport,
  partitionByAllowlist,
  UNIDENTIFIED_ADVISORY_ID,
} from "../../scripts/audit-gate.js";
import * as auditAllowlist from "../../scripts/audit-allowlist.js";
import {
  ALLOWED_ADVISORIES,
  ALLOWLIST_REVIEW_BY,
  createAllowlistLookup,
  isAdvisoryAllowed,
} from "../../scripts/audit-allowlist.js";

// Self-contained fixture IDs, deliberately NOT in the real allowlist, so these
// always land in "blocking" regardless of what the real list currently
// suppresses (which, unlike the reference implementation this was ported
// from, starts empty here — dashboard has no high/critical advisories yet).
const TEST_ID = "GHSA-0000-test-abcd";
const TEST_PACKAGE = "test-package-fixture";
const TEST_SOURCE = "synthetic-test-source-value";

function advisoryVia(id: string, severity: string) {
  return {
    name: "some-package",
    url: `https://github.com/advisories/${id}`,
    severity,
    title: `${severity} advisory ${id}`,
  };
}

// A chained "depends on vulnerable versions of X" advisory carries no upstream
// GHSA url, so the id falls back to `source-<via.source>` — the shape shared
// by every url-less-chained-advisory test below.
function urlLessChainedReport(packageName: string, source: string) {
  return {
    vulnerabilities: {
      [packageName]: {
        via: [
          {
            name: packageName,
            url: null,
            source,
            severity: "high",
            title: "Depends on vulnerable versions",
          },
        ],
      },
    },
  };
}

describe("advisoryIdFromUrl", () => {
  it("extracts the GHSA id from an advisory url", () => {
    expect(
      advisoryIdFromUrl("https://github.com/advisories/GHSA-abcd-1234"),
    ).toBe("GHSA-abcd-1234");
  });

  it("returns null for non-string input", () => {
    expect(advisoryIdFromUrl(undefined)).toBeNull();
  });
});

describe("collectBlockingAdvisories", () => {
  it("keeps only high and critical advisories", () => {
    const report = {
      vulnerabilities: {
        pkgA: { via: [advisoryVia("GHSA-high-1", "high")] },
        pkgB: { via: [advisoryVia("GHSA-mod-1", "moderate")] },
        pkgC: { via: [advisoryVia("GHSA-crit-1", "critical")] },
        pkgD: { via: [advisoryVia("GHSA-low-1", "low")] },
      },
    };
    const ids = collectBlockingAdvisories(report).map(
      (advisory) => advisory.id,
    );
    expect(ids.sort()).toEqual(["GHSA-crit-1", "GHSA-high-1"]);
  });

  it("ignores string via entries (names of other vulnerable deps)", () => {
    const report = {
      vulnerabilities: {
        pkgA: {
          via: ["another-vulnerable-dep", advisoryVia("GHSA-high-1", "high")],
        },
      },
    };
    const ids = collectBlockingAdvisories(report).map(
      (advisory) => advisory.id,
    );
    expect(ids).toEqual(["GHSA-high-1"]);
  });

  it("deduplicates advisories that surface under multiple packages", () => {
    const shared = advisoryVia("GHSA-shared", "high");
    const report = {
      vulnerabilities: {
        pkgA: { via: [shared] },
        pkgB: { via: [shared] },
      },
    };
    expect(collectBlockingAdvisories(report)).toHaveLength(1);
  });

  it("returns an empty array when there are no vulnerabilities", () => {
    expect(collectBlockingAdvisories({})).toEqual([]);
  });

  it("keeps a high advisory whose url cannot be parsed (fail closed)", () => {
    const report = {
      vulnerabilities: {
        pkgA: {
          via: [{ name: "pkgA", severity: "high", title: "no url here" }],
        },
      },
    };
    const advisories = collectBlockingAdvisories(report);
    expect(advisories).toHaveLength(1);
    expect(advisories[0].id).toBe(UNIDENTIFIED_ADVISORY_ID);
    expect(advisories[0].severity).toBe("high");
  });
});

describe("partitionByAllowlist", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks all advisories when the allowlist is empty", () => {
    const advisories = [
      {
        id: TEST_ID,
        severity: "high",
        package: TEST_PACKAGE,
        title: "t",
      },
      {
        id: "GHSA-not-allowed",
        severity: "critical",
        package: "evil",
        title: "t",
      },
    ];
    const { suppressed, blocking } = partitionByAllowlist(advisories);
    expect(suppressed).toEqual([]);
    expect(blocking.map((advisory) => advisory.id).sort()).toEqual([
      TEST_ID,
      "GHSA-not-allowed",
    ]);
  });

  it("blocks an advisory even when only the package differs from a non-existent entry", () => {
    const advisories = [
      {
        id: TEST_ID,
        severity: "high",
        package: "some-other-runtime-package",
        title: "t",
      },
    ];
    const { suppressed, blocking } = partitionByAllowlist(advisories);
    expect(suppressed).toEqual([]);
    expect(blocking).toHaveLength(1);
  });

  it("blocks two packages sharing an advisory id when the allowlist is empty", () => {
    const report = {
      vulnerabilities: {
        pkgA: {
          via: [
            {
              name: TEST_PACKAGE,
              url: `https://github.com/advisories/${TEST_ID}`,
              severity: "high",
              title: "t",
            },
          ],
        },
        pkgNew: {
          via: [
            {
              name: "newly-vulnerable-pkg",
              url: `https://github.com/advisories/${TEST_ID}`,
              severity: "high",
              title: "t",
            },
          ],
        },
      },
    };
    const { suppressed, blocking } = partitionByAllowlist(
      collectBlockingAdvisories(report),
    );
    expect(suppressed).toEqual([]);
    expect(blocking.map((advisory) => advisory.package).sort()).toEqual([
      "newly-vulnerable-pkg",
      TEST_PACKAGE,
    ]);
  });

  it("blocks everything when nothing is allowlisted", () => {
    const advisories = [
      { id: "GHSA-x", severity: "high", package: "a", title: "t" },
      { id: "GHSA-y", severity: "critical", package: "b", title: "t" },
    ];
    const { suppressed, blocking } = partitionByAllowlist(advisories);
    expect(suppressed).toEqual([]);
    expect(blocking).toHaveLength(2);
  });

  // Exercises the suppress path through the REAL `partitionByAllowlist` (not a
  // hand-rolled stand-in for its ternary) using a fixture entry built via the
  // real `createAllowlistLookup` factory, since dashboard's real
  // ALLOWED_ADVISORIES starts empty and this path would otherwise go
  // untested. Restored by the `afterEach` above.
  it("suppresses an advisory whose id::package pair matches an allowlist entry", () => {
    vi.spyOn(auditAllowlist, "isAdvisoryAllowed").mockImplementation(
      createAllowlistLookup([
        { id: TEST_ID, packages: [TEST_PACKAGE], reason: "fixture" },
      ]),
    );

    const advisories = [
      { id: TEST_ID, severity: "high", package: TEST_PACKAGE, title: "t" },
      {
        id: "GHSA-not-allowed",
        severity: "critical",
        package: "evil",
        title: "t",
      },
    ];
    const { suppressed, blocking } = partitionByAllowlist(advisories);
    expect(suppressed.map((advisory) => advisory.id)).toEqual([TEST_ID]);
    expect(blocking.map((advisory) => advisory.id)).toEqual([
      "GHSA-not-allowed",
    ]);
  });

  // No entry in the real allowlist currently uses the url-less `source-<id>`
  // shape. This verifies the derive-then-suppress round trip through the REAL
  // `partitionByAllowlist`, by swapping the module-level `isAdvisoryAllowed`
  // it calls for a lookup built from a fixture entry via the real
  // `createAllowlistLookup` factory. Restored by the `afterEach` above.
  it("suppresses a url-less chained advisory whose derived source id is allowlisted", () => {
    const report = urlLessChainedReport(TEST_PACKAGE, TEST_SOURCE);
    const advisories = collectBlockingAdvisories(report);
    const derivedId = `source-${TEST_SOURCE}`;
    expect(advisories.map((advisory) => advisory.id)).toEqual([derivedId]);

    vi.spyOn(auditAllowlist, "isAdvisoryAllowed").mockImplementation(
      createAllowlistLookup([
        { id: derivedId, packages: [TEST_PACKAGE], reason: "fixture" },
      ]),
    );

    const { suppressed, blocking } = partitionByAllowlist(advisories);
    expect(blocking).toEqual([]);
    expect(suppressed.map((advisory) => advisory.package)).toEqual([
      TEST_PACKAGE,
    ]);
  });
});

describe("isAdvisoryAllowed", () => {
  it("rejects an advisory id that is not on the allowlist", () => {
    expect(isAdvisoryAllowed("GHSA-unknown-id", "some-package")).toBe(false);
  });

  it("allows an id::package pair built via createAllowlistLookup", () => {
    const isAllowed = createAllowlistLookup([
      { id: TEST_ID, packages: [TEST_PACKAGE], reason: "fixture" },
    ]);
    expect(isAllowed(TEST_ID, TEST_PACKAGE)).toBe(true);
    expect(isAllowed(TEST_ID, "some-other-package")).toBe(false);
  });

  // Structural lint on the real allowlist file: whatever entries exist (zero
  // or more — dashboard's starts empty, unlike the reference implementation
  // this was ported from) must each carry a justified reason and a unique
  // id::package key. Passes vacuously today with zero entries; starts
  // asserting for real the moment an entry is added.
  it("gives every real allowlist entry a non-empty reason and a unique id::package key", () => {
    const keys = new Set<string>();
    for (const entry of ALLOWED_ADVISORIES) {
      expect(entry.packages.length).toBeGreaterThan(0);
      expect(entry.reason.trim().length).toBeGreaterThan(0);
      for (const packageName of entry.packages) {
        const key = `${entry.id}::${packageName}`;
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }
    }
  });
});

describe("assertUsableReport", () => {
  it("throws when npm audit returned an error object", () => {
    expect(() =>
      assertUsableReport({
        error: { code: "ENOLOCK", summary: "requires a lockfile" },
      }),
    ).toThrow(/requires a lockfile/);
  });

  it("throws when the vulnerabilities map is missing", () => {
    expect(() => assertUsableReport({ metadata: {} })).toThrow(
      /Unrecognized npm audit JSON shape/,
    );
  });

  it("accepts a report with a vulnerabilities map", () => {
    expect(() => assertUsableReport({ vulnerabilities: {} })).not.toThrow();
  });
});

describe("parseAuditReport", () => {
  it("throws on empty stdin rather than passing the gate", () => {
    expect(() => parseAuditReport("   ")).toThrow(/No npm audit JSON/);
  });

  it("throws on malformed JSON", () => {
    expect(() => parseAuditReport("{not json")).toThrow();
  });

  it("rejects an error report instead of treating it as clean", () => {
    const raw = JSON.stringify({ error: { code: "ENOLOCK" } });
    expect(() => parseAuditReport(raw)).toThrow(/npm audit failed/);
  });
});

describe("isAllowlistExpired", () => {
  it("is false before the review date", () => {
    const dayBefore = new Date(`${ALLOWLIST_REVIEW_BY}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    expect(isAllowlistExpired(dayBefore)).toBe(false);
  });

  it("is true on or after the review date", () => {
    const onDate = new Date(`${ALLOWLIST_REVIEW_BY}T00:00:00Z`);
    expect(isAllowlistExpired(onDate)).toBe(true);
  });
});
