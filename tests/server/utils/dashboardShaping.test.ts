import { describe, expect, it } from "vitest";
import {
  alertsForApp,
  computeAppStatus,
  integrationHealthForApp,
  latestMetricsBySlug,
  latestSyncedAt,
  metricRollupWithSplit,
  metricSeriesBySlug,
  rollupDelta,
  rollupSeriesAcrossApps,
  syncSourcesForApp,
  syndicationMatrixForApp,
  trafficChannelSplitAcrossApps,
  trafficChannelSplitForApp,
} from "../../../server/utils/dashboardShaping";
import type {
  IntegrationConfigRow,
  MetricSnapshotRow,
  SyncStatusRow,
  SyndicationPostRow,
  TrafficBreakdownRow,
} from "../../../server/utils/dashboardQueries";

function metricRow(overrides: Partial<MetricSnapshotRow>): MetricSnapshotRow {
  return {
    id: 1,
    slug: "basin",
    vendor: "stripe",
    metric: "mrr",
    value: 100,
    period: "current",
    capturedAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

function sessionsRow(overrides: Partial<MetricSnapshotRow>): MetricSnapshotRow {
  return metricRow({
    vendor: "ga4",
    metric: "sessions",
    period: "30d",
    ...overrides,
  });
}

function breakdownRow(
  overrides: Partial<TrafficBreakdownRow>,
): TrafficBreakdownRow {
  return {
    id: 1,
    slug: "basin",
    channel: "organic",
    pct: 40,
    capturedAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

function syncRow(overrides: Partial<SyncStatusRow>): SyncStatusRow {
  return {
    id: 1,
    slug: "basin",
    vendor: "ga4",
    lastRunAt: new Date("2026-09-19T12:00:00Z"),
    lastSuccessAt: new Date("2026-09-19T12:00:00Z"),
    ok: true,
    error: null,
    ...overrides,
  };
}

function integrationConfigRow(
  overrides: Partial<IntegrationConfigRow>,
): IntegrationConfigRow {
  return {
    id: 1,
    slug: "basin",
    vendor: "ga4",
    enabled: true,
    externalId: null,
    secretRef: null,
    encryptedSecret: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function syndicationRow(
  overrides: Partial<SyndicationPostRow>,
): SyndicationPostRow {
  return {
    id: 1,
    slug: "danholloran",
    platform: "medium",
    postRef: "post-1",
    status: "synced",
    syncedAt: new Date("2026-09-18T00:00:00Z"),
    ...overrides,
  };
}

describe("latestMetricsBySlug", () => {
  it("returns an empty array when the app has no metric rows", () => {
    expect(latestMetricsBySlug([], "basin")).toEqual([]);
  });

  it("returns only the most recent row per metric, scoped to the app", () => {
    const rows = [
      metricRow({
        metric: "mrr",
        value: 100,
        capturedAt: new Date("2026-09-01"),
      }),
      metricRow({
        metric: "mrr",
        value: 120,
        capturedAt: new Date("2026-09-10"),
      }),
      metricRow({ slug: "markpost", metric: "mrr", value: 999 }),
    ];

    expect(latestMetricsBySlug(rows, "basin")).toEqual([
      {
        metric: "mrr",
        period: "current",
        value: 120,
        capturedAt: new Date("2026-09-10").toISOString(),
      },
    ]);
  });

  it("keeps two periods of the same metric as separate entries", () => {
    const rows = [
      metricRow({ metric: "sessions", period: "7d", value: 900 }),
      metricRow({ metric: "sessions", period: "30d", value: 12400 }),
    ];

    const result = latestMetricsBySlug(rows, "basin");
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "sessions",
          period: "7d",
          value: 900,
        }),
        expect.objectContaining({
          metric: "sessions",
          period: "30d",
          value: 12400,
        }),
      ]),
    );
  });

  it("excludes PERIOD_DAILY rows — a GA4 daily backfill point is a sparkline source, not its own current-value tile", () => {
    const rows = [
      sessionsRow({ period: "30d", value: 3320 }),
      sessionsRow({
        period: "daily",
        value: 145,
        capturedAt: new Date("2026-09-19"),
      }),
    ];

    const result = latestMetricsBySlug(rows, "basin");

    expect(result).toEqual([
      {
        metric: "sessions",
        period: "30d",
        value: 3320,
        capturedAt: new Date("2026-09-01T00:00:00Z").toISOString(),
      },
    ]);
  });

  it("sums two vendors' rows for the same slug/metric/period instead of one overwriting the other (regression for #47)", () => {
    // Hashnode and DEV.to both syndicate the same content slug and each
    // write their own `posts`/`current` row — see
    // server/integrations/syndication/normalize.ts.
    const rows = [
      metricRow({
        vendor: "hashnode",
        metric: "posts",
        period: "current",
        value: 12,
        capturedAt: new Date("2026-09-18T00:00:00Z"),
      }),
      metricRow({
        vendor: "devto",
        metric: "posts",
        period: "current",
        value: 5,
        capturedAt: new Date("2026-09-19T00:00:00Z"),
      }),
    ];

    const result = latestMetricsBySlug(rows, "basin");

    expect(result).toEqual([
      {
        metric: "posts",
        period: "current",
        value: 17,
        capturedAt: new Date("2026-09-19T00:00:00Z").toISOString(),
      },
    ]);
  });

  it("sums each vendor's own latest row, not just the single latest row across vendors", () => {
    // Hashnode's most recent poll (12) is older than DEV.to's (5), but both
    // are each vendor's own latest — the tile must add both, never drop the
    // stale-looking one just because a different vendor polled more
    // recently.
    const rows = [
      metricRow({
        vendor: "hashnode",
        metric: "posts",
        period: "current",
        value: 8,
        capturedAt: new Date("2026-09-01T00:00:00Z"),
      }),
      metricRow({
        vendor: "hashnode",
        metric: "posts",
        period: "current",
        value: 12,
        capturedAt: new Date("2026-09-05T00:00:00Z"),
      }),
      metricRow({
        vendor: "devto",
        metric: "posts",
        period: "current",
        value: 5,
        capturedAt: new Date("2026-09-19T00:00:00Z"),
      }),
    ];

    const result = latestMetricsBySlug(rows, "basin");

    expect(result).toEqual([
      {
        metric: "posts",
        period: "current",
        value: 17,
        capturedAt: new Date("2026-09-19T00:00:00Z").toISOString(),
      },
    ]);
  });
});

describe("metricSeriesBySlug", () => {
  it("returns an empty array for an app with no rows", () => {
    expect(metricSeriesBySlug([], "basin")).toEqual([]);
  });

  it("groups every row for a metric into one ascending series", () => {
    const rows = [
      metricRow({
        metric: "sessions",
        period: "30d",
        value: 10,
        capturedAt: new Date("2026-09-01"),
      }),
      metricRow({
        metric: "sessions",
        period: "30d",
        value: 20,
        capturedAt: new Date("2026-09-02"),
      }),
    ];

    expect(metricSeriesBySlug(rows, "basin")).toEqual([
      {
        metric: "sessions",
        period: "30d",
        points: [
          { capturedAt: new Date("2026-09-01").toISOString(), value: 10 },
          { capturedAt: new Date("2026-09-02").toISOString(), value: 20 },
        ],
      },
    ]);
  });

  it("does not mix two periods of the same metric into one series", () => {
    const rows = [
      metricRow({
        metric: "sessions",
        period: "7d",
        value: 900,
        capturedAt: new Date("2026-09-01"),
      }),
      metricRow({
        metric: "sessions",
        period: "30d",
        value: 12400,
        capturedAt: new Date("2026-09-01"),
      }),
    ];

    const series = metricSeriesBySlug(rows, "basin");
    expect(series).toHaveLength(2);
    expect(series.find((entry) => entry.period === "7d")?.points).toEqual([
      { capturedAt: new Date("2026-09-01").toISOString(), value: 900 },
    ]);
    expect(series.find((entry) => entry.period === "30d")?.points).toEqual([
      { capturedAt: new Date("2026-09-01").toISOString(), value: 12400 },
    ]);
  });

  it("combines two vendors' history into one summed, carried-forward series instead of interleaving raw per-vendor rows (regression for #47)", () => {
    const rows = [
      metricRow({
        vendor: "hashnode",
        metric: "posts",
        period: "current",
        value: 10,
        capturedAt: new Date("2026-09-01T00:00:00Z"),
      }),
      metricRow({
        vendor: "devto",
        metric: "posts",
        period: "current",
        value: 3,
        capturedAt: new Date("2026-09-02T00:00:00Z"),
      }),
      metricRow({
        vendor: "hashnode",
        metric: "posts",
        period: "current",
        value: 12,
        capturedAt: new Date("2026-09-03T00:00:00Z"),
      }),
    ];

    const series = metricSeriesBySlug(rows, "basin");

    expect(series).toEqual([
      {
        metric: "posts",
        period: "current",
        points: [
          // Day 1: only Hashnode has reported (10).
          { capturedAt: "2026-09-01T00:00:00.000Z", value: 10 },
          // Day 2: Hashnode's last known value (10) carries forward, summed
          // with DEV.to's new row (3) — 13, not 3.
          { capturedAt: "2026-09-02T00:00:00.000Z", value: 13 },
          // Day 3: Hashnode's new row (12) plus DEV.to's carried-forward 3.
          { capturedAt: "2026-09-03T00:00:00.000Z", value: 15 },
        ],
      },
    ]);
  });
});

describe("metricRollupWithSplit", () => {
  it("returns all-null with an empty byApp when no app has any data", () => {
    expect(
      metricRollupWithSplit([], ["basin", "markpost"], "mrr", "current"),
    ).toEqual({ value: null, period: null, capturedAt: null, byApp: [] });
  });

  it("sums and splits only apps that have data, never treating a missing app as zero", () => {
    const basinRow = metricRow({
      slug: "basin",
      metric: "mrr",
      value: 100,
      capturedAt: new Date("2026-09-01"),
    });
    const markpostRow = metricRow({
      slug: "markpost",
      metric: "mrr",
      value: 200,
      capturedAt: new Date("2026-09-05"),
    });

    expect(
      metricRollupWithSplit(
        [basinRow, markpostRow],
        ["basin", "markpost", "wanderist"],
        "mrr",
        "current",
      ),
    ).toEqual({
      value: 300,
      period: "current",
      capturedAt: markpostRow.capturedAt.toISOString(),
      byApp: [
        { slug: "basin", value: 100 },
        { slug: "markpost", value: 200 },
      ],
    });
  });

  it("never sums or splits across two different periods of the same metric", () => {
    const rows = [
      metricRow({
        slug: "basin",
        metric: "sessions",
        period: "7d",
        value: 900,
      }),
      metricRow({
        slug: "markpost",
        metric: "sessions",
        period: "30d",
        value: 12400,
      }),
    ];

    expect(
      metricRollupWithSplit(rows, ["basin", "markpost"], "sessions", "30d"),
    ).toEqual({
      value: 12400,
      period: "30d",
      capturedAt: rows[1].capturedAt.toISOString(),
      byApp: [{ slug: "markpost", value: 12400 }],
    });
  });
});

describe("rollupSeriesAcrossApps", () => {
  const now = new Date("2026-09-20T00:00:00Z");

  it("returns an empty series when no app has any data", () => {
    expect(rollupSeriesAcrossApps([], ["basin"], "mrr", "current")).toEqual([]);
  });

  it("collapses multiple same-day rows from one app to the latest instead of summing them", () => {
    // A poller that runs twice in one day writes two rows that are each the
    // app's FULL current total, not two amounts to add together — summing
    // both would double the real number.
    const rows = [
      metricRow({
        slug: "basin",
        value: 900,
        capturedAt: new Date("2026-09-01T08:00:00Z"),
      }),
      metricRow({
        slug: "basin",
        value: 1000,
        capturedAt: new Date("2026-09-01T20:00:00Z"),
      }),
    ];
    // `now` pinned to the same day as the rows so the series is exactly one
    // point (no carry-forward days after it to also assert on).
    const sameDay = new Date("2026-09-01T23:00:00Z");

    expect(
      rollupSeriesAcrossApps(rows, ["basin"], "mrr", "current", 30, sameDay),
    ).toEqual([{ capturedAt: "2026-09-01T00:00:00.000Z", value: 1000 }]);
  });

  it("carries an app's last known value forward on a day it doesn't poll, rather than dropping it from that day's sum", () => {
    // This is the scenario metricRollupWithSplit's headline total already
    // handles correctly (sum of each app's latest-ever row); a rollup
    // series must agree with it, not undercount a day just because one
    // app's poll hadn't landed yet that specific day.
    const rows = [
      metricRow({
        slug: "basin",
        value: 900,
        capturedAt: new Date("2026-09-01T08:00:00Z"),
      }),
      metricRow({
        slug: "markpost",
        value: 300,
        capturedAt: new Date("2026-09-03T08:00:00Z"),
      }),
    ];
    const sameDayAsLastPoll = new Date("2026-09-03T20:00:00Z");

    expect(
      rollupSeriesAcrossApps(
        rows,
        ["basin", "markpost"],
        "mrr",
        "current",
        30,
        sameDayAsLastPoll,
      ),
    ).toEqual([
      { capturedAt: "2026-09-01T00:00:00.000Z", value: 900 },
      // markpost hasn't polled yet — basin's known value carries forward
      // alone, rather than the day being dropped or summing a phantom 0.
      { capturedAt: "2026-09-02T00:00:00.000Z", value: 900 },
      { capturedAt: "2026-09-03T00:00:00.000Z", value: 1200 },
    ]);
  });

  it("treats windowDays as whole UTC calendar days, not the last N*24 wall-clock hours", () => {
    const midday = new Date("2026-09-20T12:00:00Z");
    const rows = [
      // "Yesterday" evening — inside a genuine 2-calendar-day window (today
      // + yesterday), even though it's less than 24 raw hours before a row
      // from earlier the same day it belongs to.
      metricRow({
        value: 10,
        capturedAt: new Date("2026-09-19T18:00:00Z"),
      }),
      // The day before yesterday. Older than the row above regardless of
      // the window, so it would lose to it either way here — this test is
      // about the DAY AXIS excluding 09-18 as its own point (windowDays=2
      // only produces 09-19/09-20), not about this row failing to seed
      // anything; see the "seeds ... from before the display window" test
      // below for that.
      metricRow({
        value: 999,
        capturedAt: new Date("2026-09-18T18:00:00Z"),
      }),
    ];

    expect(
      rollupSeriesAcrossApps(rows, ["basin"], "mrr", "current", 2, midday),
    ).toEqual([
      { capturedAt: "2026-09-19T00:00:00.000Z", value: 10 },
      { capturedAt: "2026-09-20T00:00:00.000Z", value: 10 },
    ]);
  });

  it("seeds carry-forward from a row before the display window, however old, instead of dropping a stale app from early days", () => {
    // A single missed poll for any app would otherwise read as a fake jump
    // once the window starts — this is the same "sum of each app's latest
    // known value" rule metricRollupWithSplit's headline total already
    // follows, just applied once per day.
    const rows = [
      metricRow({ value: 999, capturedAt: new Date("2026-01-01T00:00:00Z") }),
      metricRow({ value: 100, capturedAt: new Date("2026-09-19T00:00:00Z") }),
    ];

    expect(
      rollupSeriesAcrossApps(rows, ["basin"], "mrr", "current", 3, now),
    ).toEqual([
      // Window covers 09-18 through 09-20 (windowDays=3, now=09-20); the
      // 01-01 row is the only thing known as of 09-18, however stale.
      { capturedAt: "2026-09-18T00:00:00.000Z", value: 999 },
      { capturedAt: "2026-09-19T00:00:00.000Z", value: 100 },
      { capturedAt: "2026-09-20T00:00:00.000Z", value: 100 },
    ]);
  });

  it("picks the row with the latest capturedAt regardless of input order, not the last element in the array", () => {
    const rows = [
      // Deliberately out of chronological order — a caller sorted
      // descending (or not at all) shouldn't change which row wins.
      metricRow({ value: 100, capturedAt: new Date("2026-09-19T00:00:00Z") }),
      metricRow({ value: 999, capturedAt: new Date("2026-01-01T00:00:00Z") }),
    ];

    expect(
      rollupSeriesAcrossApps(rows, ["basin"], "mrr", "current", 1, now),
    ).toEqual([{ capturedAt: "2026-09-20T00:00:00.000Z", value: 100 }]);
  });

  it("never mixes two different periods of the same metric into one series", () => {
    const rows = [
      sessionsRow({ period: "7d", value: 900, capturedAt: now }),
      sessionsRow({ period: "30d", value: 12400, capturedAt: now }),
    ];

    expect(
      rollupSeriesAcrossApps(rows, ["basin"], "sessions", "30d", 30, now),
    ).toEqual([{ capturedAt: now.toISOString(), value: 12400 }]);
  });

  it("ignores an app outside the requested slug list", () => {
    const rows = [metricRow({ slug: "unlisted", value: 500, capturedAt: now })];

    expect(
      rollupSeriesAcrossApps(rows, ["basin"], "mrr", "current", 30, now),
    ).toEqual([]);
  });
});

describe("rollupDelta", () => {
  it("returns null for an empty series", () => {
    expect(rollupDelta([])).toBeNull();
  });

  it("returns null for a single-point series — nothing to compare against", () => {
    expect(
      rollupDelta([{ capturedAt: "2026-09-01T00:00:00Z", value: 100 }]),
    ).toBeNull();
  });

  it("computes the absolute and percentage change from first to last point", () => {
    const series = [
      { capturedAt: "2026-09-01T00:00:00Z", value: 1000 },
      { capturedAt: "2026-09-10T00:00:00Z", value: 900 },
      { capturedAt: "2026-09-20T00:00:00Z", value: 1082 },
    ];

    expect(rollupDelta(series)).toEqual({ value: 82, pct: 8.2 });
  });

  it("returns a null pct when the first point is zero — no baseline to divide by", () => {
    const series = [
      { capturedAt: "2026-09-01T00:00:00Z", value: 0 },
      { capturedAt: "2026-09-20T00:00:00Z", value: 40 },
    ];

    expect(rollupDelta(series)).toEqual({ value: 40, pct: null });
  });
});

describe("trafficChannelSplitForApp", () => {
  it("returns an empty array when the app has no breakdown rows", () => {
    expect(trafficChannelSplitForApp([], "basin")).toEqual([]);
  });

  it("returns every channel row scoped to the app", () => {
    const rows = [
      breakdownRow({ slug: "basin", channel: "organic", pct: 44 }),
      breakdownRow({ slug: "basin", channel: "direct", pct: 56 }),
      breakdownRow({ slug: "markpost", channel: "organic", pct: 90 }),
    ];

    expect(trafficChannelSplitForApp(rows, "basin")).toEqual([
      { channel: "organic", pct: 44 },
      { channel: "direct", pct: 56 },
    ]);
  });
});

describe("trafficChannelSplitAcrossApps", () => {
  it("returns an empty array when the total sessions figure is zero (no app has a sessions metric yet)", () => {
    expect(
      trafficChannelSplitAcrossApps([], [], ["basin", "markpost"], 0),
    ).toEqual([]);
  });

  it("weighs each app's channel split by its own 30d sessions", () => {
    const breakdownRows = [
      breakdownRow({ slug: "danholloran", channel: "organic", pct: 80 }),
      breakdownRow({ slug: "neonpixels", channel: "organic", pct: 20 }),
    ];
    const metricRows = [
      sessionsRow({ slug: "danholloran", value: 12400 }),
      sessionsRow({ slug: "neonpixels", value: 6100 }),
    ];

    const result = trafficChannelSplitAcrossApps(
      breakdownRows,
      metricRows,
      ["danholloran", "neonpixels"],
      18500,
    );

    // (12400*0.8 + 6100*0.2) / 18500 = 60.22%
    expect(result).toEqual([{ channel: "organic", pct: 60.22 }]);
  });

  it("excludes an app with a breakdown but no sessions metric at all, rather than weighting it at zero", () => {
    const breakdownRows = [
      breakdownRow({ slug: "basin", channel: "organic", pct: 100 }),
      breakdownRow({ slug: "markpost", channel: "direct", pct: 100 }),
    ];
    const metricRows = [sessionsRow({ slug: "basin", value: 500 })];

    // markpost never reported a sessions metric, so it's excluded from the
    // rollup total too — the total here is basin's 500 alone.
    const result = trafficChannelSplitAcrossApps(
      breakdownRows,
      metricRows,
      ["basin", "markpost"],
      500,
    );

    expect(result).toEqual([{ channel: "organic", pct: 100 }]);
  });

  it("doesn't inflate percentages to 100% when some apps' sessions aren't attributed to any channel yet", () => {
    const breakdownRows = [
      breakdownRow({ slug: "basin", channel: "organic", pct: 100 }),
    ];
    const metricRows = [
      sessionsRow({ slug: "basin", value: 1000 }),
      // markpost has a sessions metric (it's part of the rollup total) but
      // its GA4 breakdown hasn't synced yet.
      sessionsRow({ slug: "markpost", value: 9000 }),
    ];

    // Matches sessions30d.value for these two apps: 1000 + 9000.
    const result = trafficChannelSplitAcrossApps(
      breakdownRows,
      metricRows,
      ["basin", "markpost"],
      10000,
    );

    expect(result).toEqual([{ channel: "organic", pct: 10 }]);
  });
});

describe("computeAppStatus", () => {
  it("reports NOT SYNCED (muted) when no sync_status row exists yet", () => {
    expect(computeAppStatus([], [], "basin")).toEqual({
      label: "NOT SYNCED",
      tone: "muted",
    });
  });

  it("reports LIVE (ok) when every vendor is healthy", () => {
    const rows = [
      syncRow({ vendor: "ga4", ok: true }),
      syncRow({ vendor: "stripe", ok: true }),
    ];
    expect(computeAppStatus(rows, [], "basin")).toEqual({
      label: "LIVE",
      tone: "ok",
    });
  });

  it("reports the singular ISSUE label for exactly one failing vendor", () => {
    const rows = [syncRow({ vendor: "stripe", ok: false })];
    expect(computeAppStatus(rows, [], "basin")).toEqual({
      label: "1 ISSUE",
      tone: "danger",
    });
  });

  it("counts failing vendors (danger) when more than one sync is unhealthy", () => {
    const rows = [
      syncRow({ vendor: "ga4", ok: true }),
      syncRow({ vendor: "stripe", ok: false }),
      syncRow({ vendor: "sentry", ok: false }),
    ];
    expect(computeAppStatus(rows, [], "basin")).toEqual({
      label: "2 ISSUES",
      tone: "danger",
    });
  });

  it("stops counting a vendor once it's explicitly disabled in integration_config", () => {
    const syncRows = [syncRow({ vendor: "stripe", ok: false })];
    const configRows = [
      integrationConfigRow({ vendor: "stripe", enabled: false }),
    ];
    expect(computeAppStatus(syncRows, configRows, "basin")).toEqual({
      label: "NOT SYNCED",
      tone: "muted",
    });
  });

  it("still counts a failing vendor that has no integration_config row at all", () => {
    const syncRows = [syncRow({ vendor: "github", ok: false })];
    expect(computeAppStatus(syncRows, [], "basin")).toEqual({
      label: "1 ISSUE",
      tone: "danger",
    });
  });
});

describe("integrationHealthForApp", () => {
  it("returns null health fields for a configured vendor that's never synced", () => {
    const configRows = [
      integrationConfigRow({ vendor: "stripe", enabled: true }),
    ];
    expect(integrationHealthForApp([], configRows, "basin")).toEqual([
      {
        vendor: "stripe",
        enabled: true,
        ok: null,
        lastRunAt: null,
        lastSuccessAt: null,
        error: null,
      },
    ]);
  });

  it("joins the matching sync_status row by (slug, vendor)", () => {
    const configRows = [integrationConfigRow({ vendor: "ga4", enabled: true })];
    const syncRows = [
      syncRow({ vendor: "ga4", ok: false, error: "rate limited" }),
      syncRow({ slug: "markpost", vendor: "ga4", ok: true }),
    ];

    expect(integrationHealthForApp(syncRows, configRows, "basin")).toEqual([
      {
        vendor: "ga4",
        enabled: true,
        ok: false,
        lastRunAt: syncRows[0].lastRunAt?.toISOString(),
        lastSuccessAt: syncRows[0].lastSuccessAt?.toISOString(),
        error: "rate limited",
      },
    ]);
  });
});

describe("syncSourcesForApp", () => {
  it("returns an empty array for an app with no sync history", () => {
    expect(syncSourcesForApp([], "basin")).toEqual([]);
  });

  it("maps every sync_status row for the app, scoped by slug", () => {
    const rows = [
      syncRow({ vendor: "ga4", ok: true }),
      syncRow({ slug: "markpost", vendor: "ga4", ok: false }),
    ];

    expect(syncSourcesForApp(rows, "basin")).toEqual([
      {
        vendor: "ga4",
        ok: true,
        lastRunAt: rows[0].lastRunAt?.toISOString(),
        lastSuccessAt: rows[0].lastSuccessAt?.toISOString(),
        error: null,
      },
    ]);
  });
});

describe("alertsForApp", () => {
  it("returns no alerts when every vendor is healthy", () => {
    expect(alertsForApp([syncRow({ ok: true })], [], "basin")).toEqual([]);
  });

  it("builds one alert per failing vendor, falling back to a generic message", () => {
    const rows = [syncRow({ vendor: "stripe", ok: false, error: null })];
    expect(alertsForApp(rows, [], "basin")).toEqual([
      {
        slug: "basin",
        vendor: "stripe",
        message: "stripe sync is failing",
        occurredAt: rows[0].lastRunAt?.toISOString(),
      },
    ]);
  });

  it("falls back to the generic message for an empty-string error too", () => {
    const rows = [syncRow({ vendor: "stripe", ok: false, error: "" })];
    expect(alertsForApp(rows, [], "basin")[0]?.message).toBe(
      "stripe sync is failing",
    );
  });

  it("suppresses an alert for a vendor that's been explicitly disabled", () => {
    const syncRows = [syncRow({ vendor: "stripe", ok: false })];
    const configRows = [
      integrationConfigRow({ vendor: "stripe", enabled: false }),
    ];
    expect(alertsForApp(syncRows, configRows, "basin")).toEqual([]);
  });
});

describe("latestSyncedAt", () => {
  it("returns null when nothing has ever synced successfully", () => {
    expect(latestSyncedAt([])).toBeNull();
    expect(latestSyncedAt([syncRow({ lastSuccessAt: null })])).toBeNull();
  });

  it("returns the most recent lastSuccessAt across all rows", () => {
    const rows = [
      syncRow({ lastSuccessAt: new Date("2026-09-10T00:00:00Z") }),
      syncRow({ lastSuccessAt: new Date("2026-09-19T00:00:00Z") }),
    ];
    expect(latestSyncedAt(rows)).toBe(
      new Date("2026-09-19T00:00:00Z").toISOString(),
    );
  });
});

describe("syndicationMatrixForApp", () => {
  it("returns an empty array for an app with no syndication rows", () => {
    expect(syndicationMatrixForApp([])).toEqual([]);
  });

  it("groups multiple platform rows for the same post into one matrix row", () => {
    const rows = [
      syndicationRow({
        postRef: "post-1",
        platform: "medium",
        status: "synced",
      }),
      syndicationRow({
        postRef: "post-1",
        platform: "hashnode",
        status: "failed",
        syncedAt: null,
      }),
    ];

    expect(syndicationMatrixForApp(rows)).toEqual([
      {
        postRef: "post-1",
        cells: [
          {
            platform: "medium",
            status: "synced",
            syncedAt: rows[0].syncedAt?.toISOString(),
          },
          { platform: "hashnode", status: "failed", syncedAt: null },
        ],
      },
    ]);
  });
});
