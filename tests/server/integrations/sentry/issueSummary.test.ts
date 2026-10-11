import { describe, expect, it } from "vitest";
import {
  aggregateEventTrend,
  buildSentryIssuesUrl,
  toSentryIssueSummary,
} from "../../../../server/integrations/sentry/issueSummary";
import type { SentryIssueSummary } from "../../../../server/integrations/sentry/types";

const RAW_ISSUE = {
  id: "10",
  title: "TypeError: feed.items is undefined",
  level: "error",
  culprit: "parsers/rss.ts",
  count: "41",
  userCount: 14,
  lastSeen: "2026-09-19T00:00:00.000Z",
  permalink: "https://sentry.io/organizations/acme/issues/10/",
  project: { id: "7", slug: "markpost" },
  stats: {
    "14d": [
      [1_758_153_600, 1],
      [1_758_240_000, 2],
    ],
  },
};

function summary(
  eventStats: SentryIssueSummary["eventStats"],
): SentryIssueSummary {
  return { ...toSentryIssueSummary(RAW_ISSUE), eventStats };
}

describe("toSentryIssueSummary", () => {
  it("accepts a sentry.io subdomain permalink", () => {
    expect(
      toSentryIssueSummary({
        ...RAW_ISSUE,
        permalink: "https://acme.sentry.io/issues/10/",
      }).permalink,
    ).toBe("https://acme.sentry.io/issues/10/");
  });

  it("maps a raw issue, parsing the string event count", () => {
    expect(toSentryIssueSummary(RAW_ISSUE)).toEqual({
      id: "10",
      title: "TypeError: feed.items is undefined",
      level: "error",
      culprit: "parsers/rss.ts",
      eventCount: 41,
      userCount: 14,
      lastSeen: "2026-09-19T00:00:00.000Z",
      permalink: "https://sentry.io/organizations/acme/issues/10/",
      projectId: "7",
      eventStats: [
        { timestamp: 1_758_153_600, count: 1 },
        { timestamp: 1_758_240_000, count: 2 },
      ],
    });
  });

  it("tolerates a missing culprit, project and stats", () => {
    const {
      culprit: _culprit,
      project: _project,
      stats: _stats,
      ...bare
    } = RAW_ISSUE;

    expect(toSentryIssueSummary(bare)).toMatchObject({
      culprit: "",
      projectId: null,
      eventStats: [],
    });
  });

  it("drops malformed stats buckets instead of failing the issue", () => {
    const result = toSentryIssueSummary({
      ...RAW_ISSUE,
      stats: { "14d": [[1, 2], "bad", [3], ["x", 1]] },
    });

    expect(result.eventStats).toEqual([{ timestamp: 1, count: 2 }]);
  });

  it.each([
    ["not an object", null, "not an object"],
    ["missing title", { ...RAW_ISSUE, title: undefined }, '"title"'],
    ["missing id", { ...RAW_ISSUE, id: 4 }, '"id"'],
    ["non-numeric count", { ...RAW_ISSUE, count: "many" }, '"count"'],
    [
      "missing userCount",
      { ...RAW_ISSUE, userCount: undefined },
      '"userCount"',
    ],
    [
      "http permalink",
      { ...RAW_ISSUE, permalink: "http://sentry.io/x" },
      "https sentry.io URL",
    ],
    [
      "javascript permalink",
      { ...RAW_ISSUE, permalink: "javascript:alert(1)" },
      "https sentry.io URL",
    ],
    [
      "foreign-host permalink",
      { ...RAW_ISSUE, permalink: "https://evil.example/sentry.io" },
      "https sentry.io URL",
    ],
    [
      "look-alike-host permalink",
      { ...RAW_ISSUE, permalink: "https://notsentry.io/x" },
      "https sentry.io URL",
    ],
    [
      "unparseable permalink",
      { ...RAW_ISSUE, permalink: "nope" },
      "https sentry.io URL",
    ],
  ])("fails loud on %s", (_name, raw, message) => {
    expect(() => toSentryIssueSummary(raw)).toThrow(message);
  });
});

describe("aggregateEventTrend", () => {
  it("sums buckets with the same timestamp across issues, oldest first", () => {
    const trend = aggregateEventTrend([
      summary([
        { timestamp: 200, count: 2 },
        { timestamp: 100, count: 1 },
      ]),
      summary([{ timestamp: 200, count: 5 }]),
    ]);

    expect(trend).toEqual([
      { capturedAt: "1970-01-01T00:01:40.000Z", value: 1 },
      { capturedAt: "1970-01-01T00:03:20.000Z", value: 7 },
    ]);
  });

  it("is empty when there are no issues", () => {
    expect(aggregateEventTrend([])).toEqual([]);
  });
});

describe("buildSentryIssuesUrl", () => {
  it("links to the unresolved issues of the project by id", () => {
    expect(buildSentryIssuesUrl("acme", "markpost", "7")).toBe(
      "https://sentry.io/organizations/acme/issues/?project=7&query=is%3Aunresolved",
    );
  });

  it("falls back to the project page when no project id is known", () => {
    expect(buildSentryIssuesUrl("acme", "mark/post", null)).toBe(
      "https://sentry.io/organizations/acme/projects/mark%2Fpost/",
    );
  });
});
