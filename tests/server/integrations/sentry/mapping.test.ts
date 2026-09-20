import { describe, expect, it } from "vitest";
import {
  parseSentryNextCursor,
  sentryStatusChip,
  toSentryIssue,
} from "../../../../server/integrations/sentry/mapping";

describe("parseSentryNextCursor", () => {
  it("returns null when the Link header is missing entirely", () => {
    expect(parseSentryNextCursor(null)).toBeNull();
  });

  it("extracts the next cursor when results is true", () => {
    const linkHeader =
      '<https://sentry.io/api/0/projects/acme/markpost/issues/?cursor=0:100:0>; rel="previous"; results="false"; cursor="0:0:1", ' +
      '<https://sentry.io/api/0/projects/acme/markpost/issues/?cursor=0:200:0>; rel="next"; results="true"; cursor="0:200:0"';

    expect(parseSentryNextCursor(linkHeader)).toBe("0:200:0");
  });

  it("returns null when the next relation reports results=false, even though a cursor value is present", () => {
    const linkHeader =
      '<https://sentry.io/api/0/projects/acme/markpost/issues/?cursor=0:0:1>; rel="previous"; results="false"; cursor="0:0:1", ' +
      '<https://sentry.io/api/0/projects/acme/markpost/issues/?cursor=0:100:0>; rel="next"; results="false"; cursor="0:100:0"';

    expect(parseSentryNextCursor(linkHeader)).toBeNull();
  });

  it('returns null for a header with no rel="next" segment at all', () => {
    const linkHeader =
      '<https://sentry.io/api/0/projects/acme/markpost/issues/?cursor=0:0:1>; rel="previous"; results="false"; cursor="0:0:1"';

    expect(parseSentryNextCursor(linkHeader)).toBeNull();
  });
});

describe("toSentryIssue", () => {
  it("keeps the string id", () => {
    expect(toSentryIssue({ id: "issue_1", level: "fatal" })).toEqual({
      id: "issue_1",
    });
  });

  it("fails loud when id is missing", () => {
    expect(() => toSentryIssue({ level: "fatal" })).toThrow(
      /missing a string "id" field/,
    );
  });

  it("fails loud when id is not a string", () => {
    expect(() => toSentryIssue({ id: 123 })).toThrow(
      /missing a string "id" field/,
    );
  });

  it("fails loud on a non-object row", () => {
    expect(() => toSentryIssue("not-an-object")).toThrow(
      /missing a string "id" field/,
    );
    expect(() => toSentryIssue(null)).toThrow(/missing a string "id" field/);
  });
});

describe("sentryStatusChip", () => {
  it("returns an ok tone with no open or fatal issues", () => {
    expect(sentryStatusChip(0, 0)).toEqual({ label: "OK", tone: "ok" });
  });

  it("returns a warn tone, labeled with the open count (not pluralized), when there are open issues but no fatals", () => {
    expect(sentryStatusChip(4, 0)).toEqual({ label: "4 OPEN", tone: "warn" });
  });

  it("uses the same non-pluralized label for exactly one open issue", () => {
    expect(sentryStatusChip(1, 0)).toEqual({ label: "1 OPEN", tone: "warn" });
  });

  it("returns a danger tone, labeled with the fatal count, once any fatal issue exists", () => {
    expect(sentryStatusChip(5, 1)).toEqual({
      label: "1 FATAL",
      tone: "danger",
    });
  });

  it("does not pluralize the fatal label for more than one fatal issue, matching the issue's own example label", () => {
    expect(sentryStatusChip(10, 3)).toEqual({
      label: "3 FATAL",
      tone: "danger",
    });
  });

  it("prioritizes the fatal count over open-issue volume (fatal always wins the tone)", () => {
    // Even a huge open count must not outrank a single fatal issue.
    expect(sentryStatusChip(500, 1)).toEqual({
      label: "1 FATAL",
      tone: "danger",
    });
  });
});
