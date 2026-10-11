import { describe, expect, it } from "vitest";
import {
  buildSentryIssueRows,
  buildSentryTrendPath,
} from "../../app/utils/sentryPanel";

const ISSUE = {
  id: "1",
  title: "Boom",
  level: "error",
  culprit: "a.ts",
  eventCount: 1_204,
  userCount: 1,
  lastSeen: "2026-09-19T00:00:00.000Z",
  permalink: "https://sentry.io/organizations/acme/issues/1/",
};

describe("buildSentryIssueRows", () => {
  it("formats counts with pluralization and keeps the issue link", () => {
    expect(buildSentryIssueRows([ISSUE])[0]).toMatchObject({
      levelLabel: "ERROR",
      eventsLabel: "1,204 events",
      usersLabel: "1 user",
      location: "a.ts",
      permalink: ISSUE.permalink,
    });
  });

  it("singularizes a single event and pluralizes zero users", () => {
    expect(
      buildSentryIssueRows([{ ...ISSUE, eventCount: 1, userCount: 0 }])[0],
    ).toMatchObject({ eventsLabel: "1 event", usersLabel: "0 users" });
  });

  it.each([
    ["fatal", "var(--err)"],
    ["error", "var(--warn)"],
    ["warning", "var(--ink-2)"],
    ["something-new", "var(--ink-2)"],
    ["constructor", "var(--ink-2)"],
  ])("colors level %s", (level, color) => {
    expect(buildSentryIssueRows([{ ...ISSUE, level }])[0]?.levelColor).toBe(
      color,
    );
  });
});

describe("buildSentryTrendPath", () => {
  it("is empty without data so the chart is skipped", () => {
    expect(buildSentryTrendPath([])).toBe("");
  });

  it("draws a path across the viewBox for a real series", () => {
    const path = buildSentryTrendPath([
      { capturedAt: "2026-09-18T00:00:00.000Z", value: 1 },
      { capturedAt: "2026-09-19T00:00:00.000Z", value: 5 },
    ]);

    expect(path).toMatch(/^M0\.00 /);
    expect(path).toContain("L300.00 ");
  });
});
