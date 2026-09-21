import { describe, expect, it } from "vitest";
import {
  CARD_METRIC_NAMES,
  formatMetricValue,
  integrationChipLabel,
  metricLabel,
  metricTone,
  selectCardStats,
  selectSparklineSeries,
} from "../../app/utils/propertyCardMetrics";
import {
  METRIC_ACTIVE_SUBSCRIBERS,
  METRIC_MRR,
  METRIC_OPEN_ISSUES,
  METRIC_POSTS,
  METRIC_SESSIONS,
  METRIC_USERS,
} from "../../server/utils/dashboardMetrics";
import type { CurrentMetric, MetricSeries } from "../../shared/types/dashboard";

const capturedAt = "2026-09-20T00:00:00.000Z";

function metric(
  metricName: string,
  period: string,
  value: number,
): CurrentMetric {
  return { metric: metricName, period, value, capturedAt };
}

describe("CARD_METRIC_NAMES", () => {
  it("stays in sync with server/utils/dashboardMetrics.ts's canonical metric names", () => {
    // app/ can't import server/ code at runtime (Nitro/client boundary —
    // see this module's top-of-file comment), so the two lists are
    // maintained by hand. This test is the thing that actually catches
    // them drifting apart, run in plain Node/vitest where that boundary
    // doesn't apply.
    const canonicalMetricNames = [
      METRIC_MRR,
      METRIC_ACTIVE_SUBSCRIBERS,
      METRIC_SESSIONS,
      METRIC_OPEN_ISSUES,
      METRIC_USERS,
      METRIC_POSTS,
    ];
    CARD_METRIC_NAMES.forEach((metricName) => {
      expect(canonicalMetricNames).toContain(metricName);
    });
  });
});

describe("selectCardStats", () => {
  it("prioritizes mrr, then audience size, then open_issues, over sessions/posts, regardless of input order", () => {
    const metrics = [
      metric("posts", "current", 4),
      metric("open_issues", "current", 1),
      metric("sessions", "30d", 8600),
      metric("active_subscribers", "current", 96),
      metric("mrr", "current", 412),
    ];
    expect(selectCardStats(metrics).map((row) => row.metric)).toEqual([
      "mrr",
      "active_subscribers",
      "open_issues",
    ]);
  });

  it("caps at PROPERTY_CARD_STAT_COUNT even when more real metrics are available", () => {
    const metrics = [
      metric("mrr", "current", 1),
      metric("active_subscribers", "current", 2),
      metric("open_issues", "current", 3),
      metric("sessions", "30d", 4),
      metric("posts", "current", 5),
    ];
    expect(selectCardStats(metrics)).toHaveLength(3);
    expect(selectCardStats(metrics).map((row) => row.metric)).toEqual([
      "mrr",
      "active_subscribers",
      "open_issues",
    ]);
  });

  it("never surfaces both active_subscribers and users as separate stats — they fill one audience slot, preferring active_subscribers", () => {
    const metrics = [
      metric("active_subscribers", "current", 96),
      metric("users", "current", 1204),
      metric("mrr", "current", 412),
    ];
    const selected = selectCardStats(metrics);
    expect(selected.map((row) => row.metric)).toEqual([
      "mrr",
      "active_subscribers",
    ]);
    // Only one metric ever maps to the "USERS" label per card — asserted
    // here directly, since PropertyCard.vue would otherwise render two
    // identical "USERS" columns with no way to tell them apart.
    expect(selected.map((row) => metricLabel(row.metric))).toEqual([
      "MRR",
      "USERS",
    ]);
  });

  it("falls back to users when active_subscribers isn't synced for this app", () => {
    const metrics = [metric("users", "current", 1204)];
    expect(selectCardStats(metrics)).toEqual(metrics);
  });

  it("skips metrics the app doesn't have instead of fabricating placeholders", () => {
    const metrics = [
      metric("sessions", "30d", 100),
      metric("posts", "current", 2),
    ];
    expect(selectCardStats(metrics).map((row) => row.metric)).toEqual([
      "sessions",
      "posts",
    ]);
  });

  it("never returns two entries with the same metric name, even if the app has it at multiple periods", () => {
    const metrics = [
      metric("sessions", "7d", 900),
      metric("sessions", "30d", 3600),
    ];
    const selected = selectCardStats(metrics);
    expect(selected).toHaveLength(1);
    // Prefers the priority table's declared period (30d) over whichever
    // period happens first in the input.
    expect(selected[0]).toMatchObject({ period: "30d", value: 3600 });
  });

  it("falls back to whatever period is available when the preferred one is missing", () => {
    const metrics = [metric("sessions", "7d", 900)];
    expect(selectCardStats(metrics)).toEqual([metric("sessions", "7d", 900)]);
  });

  it("returns an empty list for an app with no synced metrics", () => {
    expect(selectCardStats([])).toEqual([]);
  });
});

describe("metricLabel", () => {
  it.each([
    ["mrr", "MRR"],
    ["active_subscribers", "USERS"],
    ["users", "USERS"],
    ["sessions", "SESSIONS"],
    ["open_issues", "ISSUES"],
    ["posts", "POSTS"],
  ])("labels %s as %s", (metricName, expected) => {
    expect(metricLabel(metricName)).toBe(expected);
  });

  it("humanizes an unrecognized metric name instead of rendering it blank", () => {
    expect(metricLabel("new_users")).toBe("NEW USERS");
  });
});

describe("formatMetricValue", () => {
  it("formats mrr as currency", () => {
    expect(formatMetricValue(metric("mrr", "current", 412))).toBe("$412");
  });

  it("formats sessions as a compact count", () => {
    expect(formatMetricValue(metric("sessions", "30d", 8600))).toBe("8.6K");
  });

  it("formats users/active_subscribers/open_issues/posts as plain counts", () => {
    expect(
      formatMetricValue(metric("active_subscribers", "current", 1204)),
    ).toBe("1,204");
    expect(formatMetricValue(metric("open_issues", "current", 3))).toBe("3");
  });

  it("falls back to a plain count for an unrecognized metric", () => {
    expect(formatMetricValue(metric("new_users", "current", 12))).toBe("12");
  });
});

describe("metricTone", () => {
  it("is undefined for money/audience metrics regardless of value", () => {
    expect(metricTone(metric("mrr", "current", 0))).toBeUndefined();
    expect(
      metricTone(metric("active_subscribers", "current", 0)),
    ).toBeUndefined();
  });

  it("is ok for zero open issues and danger once there's at least one", () => {
    expect(metricTone(metric("open_issues", "current", 0))).toBe("ok");
    expect(metricTone(metric("open_issues", "current", 1))).toBe("danger");
  });
});

describe("selectSparklineSeries", () => {
  const mrrCurrent = metric("mrr", "current", 412);
  const sessions30d = metric("sessions", "30d", 8600);
  const mrrSeries: MetricSeries = {
    metric: "mrr",
    period: "current",
    points: [{ capturedAt, value: 1 }],
  };
  const sessionsSeries: MetricSeries = {
    metric: "sessions",
    period: "30d",
    points: [{ capturedAt, value: 2 }],
  };

  it("picks the series matching the highest-priority visible stat that has one", () => {
    expect(
      selectSparklineSeries(
        [sessionsSeries, mrrSeries],
        [mrrCurrent, sessions30d],
      ),
    ).toBe(mrrSeries);
  });

  it("falls through to a lower-priority visible stat's series when the leading stat has none", () => {
    expect(
      selectSparklineSeries([sessionsSeries], [mrrCurrent, sessions30d]),
    ).toBe(sessionsSeries);
  });

  it("never returns a series for a metric that isn't one of the card's own visible stats", () => {
    const fatalIssuesSeries: MetricSeries = {
      metric: "fatal_issues",
      period: "current",
      points: [{ capturedAt, value: 1 }],
    };
    expect(selectSparklineSeries([fatalIssuesSeries], [mrrCurrent])).toBeNull();
  });

  it("returns null when none of the visible stats have series data yet", () => {
    expect(selectSparklineSeries([], [mrrCurrent])).toBeNull();
  });

  it("returns null when there are no visible stats at all", () => {
    expect(selectSparklineSeries([mrrSeries], [])).toBeNull();
  });
});

describe("integrationChipLabel", () => {
  it("renders a plain uppercase vendor name for an enabled integration", () => {
    expect(integrationChipLabel({ vendor: "stripe", enabled: true })).toBe(
      "STRIPE",
    );
  });

  it("renders a connect prompt for a configured-but-disabled integration", () => {
    expect(integrationChipLabel({ vendor: "stripe", enabled: false })).toBe(
      "+ CONNECT STRIPE",
    );
  });
});
