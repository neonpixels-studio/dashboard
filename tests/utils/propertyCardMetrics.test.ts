import { describe, expect, it } from "vitest";
import {
  formatMetricValue,
  integrationChipLabel,
  metricLabel,
  metricTone,
  selectCardStats,
  selectSparklineSeries,
} from "../../app/utils/propertyCardMetrics";
import type { CurrentMetric, MetricSeries } from "../../shared/types/dashboard";

const capturedAt = "2026-09-20T00:00:00.000Z";

function metric(
  metricName: string,
  period: string,
  value: number,
): CurrentMetric {
  return { metric: metricName, period, value, capturedAt };
}

describe("selectCardStats", () => {
  it("prioritizes mrr, active_subscribers, and open_issues over sessions/posts, regardless of input order", () => {
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
      metric("users", "current", 3),
      metric("sessions", "30d", 4),
      metric("open_issues", "current", 5),
      metric("posts", "current", 6),
    ];
    expect(selectCardStats(metrics)).toHaveLength(3);
    expect(selectCardStats(metrics).map((row) => row.metric)).toEqual([
      "mrr",
      "active_subscribers",
      "users",
    ]);
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
    ["fatal_issues", "FATAL"],
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

  it("is ok for zero open/fatal issues and danger once there's at least one", () => {
    expect(metricTone(metric("open_issues", "current", 0))).toBe("ok");
    expect(metricTone(metric("open_issues", "current", 1))).toBe("danger");
    expect(metricTone(metric("fatal_issues", "current", 2))).toBe("danger");
  });
});

describe("selectSparklineSeries", () => {
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

  it("picks the series matching the card's primary stat", () => {
    expect(
      selectSparklineSeries(
        [sessionsSeries, mrrSeries],
        metric("mrr", "current", 412),
      ),
    ).toBe(mrrSeries);
  });

  it("falls back to the first available series when the primary stat has no matching history", () => {
    expect(
      selectSparklineSeries([sessionsSeries], metric("mrr", "current", 412)),
    ).toBe(sessionsSeries);
  });

  it("falls back to the first series when there's no primary stat at all", () => {
    expect(selectSparklineSeries([sessionsSeries, mrrSeries], undefined)).toBe(
      sessionsSeries,
    );
  });

  it("returns null when the app has no series data synced", () => {
    expect(selectSparklineSeries([], metric("mrr", "current", 412))).toBeNull();
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
