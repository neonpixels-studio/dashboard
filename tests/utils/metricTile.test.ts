import { describe, expect, it } from "vitest";
import {
  buildMetricTileData,
  METRIC_MRR,
  METRIC_SESSIONS,
  PERIOD_30D,
  PERIOD_CURRENT,
  seriesDelta,
} from "../../app/utils/metricTile";
import type { CurrentMetric, MetricSeries } from "../../shared/types/dashboard";

function metric(overrides: Partial<CurrentMetric> = {}): CurrentMetric {
  return {
    metric: METRIC_SESSIONS,
    period: PERIOD_30D,
    value: 100,
    capturedAt: "2026-09-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("seriesDelta", () => {
  it("returns null for fewer than two points", () => {
    expect(seriesDelta([])).toBeNull();
    expect(
      seriesDelta([{ capturedAt: "2026-09-19T00:00:00.000Z", value: 5 }]),
    ).toBeNull();
  });

  it("computes the change from the first to the last point", () => {
    const delta = seriesDelta([
      { capturedAt: "2026-08-20T00:00:00.000Z", value: 100 },
      { capturedAt: "2026-09-01T00:00:00.000Z", value: 150 },
      { capturedAt: "2026-09-19T00:00:00.000Z", value: 120 },
    ]);
    expect(delta).toEqual({ value: 20, pct: 20 });
  });

  it("reports a null pct when the baseline is zero, never a fabricated percentage", () => {
    const delta = seriesDelta([
      { capturedAt: "2026-08-20T00:00:00.000Z", value: 0 },
      { capturedAt: "2026-09-19T00:00:00.000Z", value: 10 },
    ]);
    expect(delta).toEqual({ value: 10, pct: null });
  });
});

describe("buildMetricTileData", () => {
  it("renders an honest not-synced placeholder when the metric has no data yet", () => {
    const tile = buildMetricTileData(METRIC_MRR, PERIOD_CURRENT, [], []);
    expect(tile).toEqual({
      label: "MRR",
      value: "—",
      delta: "—",
      deltaTone: "muted",
      sub: "Not synced yet",
    });
  });

  it("formats a currency metric with a % delta and an ok tone when it rose", () => {
    const metrics = [
      metric({ metric: METRIC_MRR, period: PERIOD_CURRENT, value: 412 }),
    ];
    const series: MetricSeries[] = [
      {
        metric: METRIC_MRR,
        period: PERIOD_CURRENT,
        points: [
          { capturedAt: "2026-08-20T00:00:00.000Z", value: 400 },
          { capturedAt: "2026-09-19T00:00:00.000Z", value: 412 },
        ],
      },
    ];

    const tile = buildMetricTileData(
      METRIC_MRR,
      PERIOD_CURRENT,
      metrics,
      series,
    );

    expect(tile.label).toBe("MRR");
    expect(tile.value).toBe("$412");
    expect(tile.delta).toBe("▲ 3.0%");
    expect(tile.deltaTone).toBe("ok");
    expect(tile.sub).toBe("Synced 19 SEP 2026");
  });

  it("formats a count metric with a count delta, not a percentage", () => {
    const metrics = [metric({ value: 1204 })];
    const series: MetricSeries[] = [
      {
        metric: METRIC_SESSIONS,
        period: PERIOD_30D,
        points: [
          { capturedAt: "2026-08-20T00:00:00.000Z", value: 900 },
          { capturedAt: "2026-09-19T00:00:00.000Z", value: 1204 },
        ],
      },
    ];

    const tile = buildMetricTileData(
      METRIC_SESSIONS,
      PERIOD_30D,
      metrics,
      series,
    );

    expect(tile.value).toBe("1,204");
    expect(tile.delta).toBe("▲ 304");
    expect(tile.deltaTone).toBe("ok");
  });

  it("shows a muted dash delta when only one point of history exists", () => {
    const metrics = [metric()];
    const tile = buildMetricTileData(METRIC_SESSIONS, PERIOD_30D, metrics, []);
    expect(tile.delta).toBe("—");
    expect(tile.deltaTone).toBe("muted");
  });
});
