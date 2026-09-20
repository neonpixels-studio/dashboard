import { describe, expect, it } from "vitest";
import {
  alertsForApp,
  computeAppStatus,
  integrationHealthForApp,
  latestMetricsBySlug,
  latestSyncedAt,
  metricSeriesBySlug,
  metricSplitByApp,
  sumLatestMetricAcrossApps,
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
});

describe("sumLatestMetricAcrossApps", () => {
  it("returns all-null when no app has any data for the metric", () => {
    expect(sumLatestMetricAcrossApps([], ["basin", "markpost"], "mrr")).toEqual(
      {
        value: null,
        period: null,
        capturedAt: null,
      },
    );
  });

  it("sums only apps that have data, never treating a missing app as zero", () => {
    const rows = [
      metricRow({
        slug: "basin",
        metric: "mrr",
        value: 100,
        capturedAt: new Date("2026-09-01"),
      }),
      metricRow({
        slug: "markpost",
        metric: "mrr",
        value: 200,
        capturedAt: new Date("2026-09-05"),
      }),
    ];

    expect(
      sumLatestMetricAcrossApps(
        rows,
        ["basin", "markpost", "wanderist"],
        "mrr",
      ),
    ).toEqual({
      value: 300,
      period: "current",
      capturedAt: new Date("2026-09-05").toISOString(),
    });
  });
});

describe("metricSplitByApp", () => {
  it("omits apps with no data rather than reporting a zero", () => {
    const rows = [
      metricRow({ slug: "basin", metric: "open_issues", value: 3 }),
    ];

    expect(
      metricSplitByApp(rows, ["basin", "markpost"], "open_issues"),
    ).toEqual([{ slug: "basin", value: 3 }]);
  });
});

describe("trafficChannelSplitForApp", () => {
  it("returns an empty array when the app has no breakdown rows", () => {
    expect(trafficChannelSplitForApp([], "basin")).toEqual([]);
  });

  it("returns only the latest capturedAt batch of channels", () => {
    const rows = [
      breakdownRow({
        channel: "organic",
        pct: 30,
        capturedAt: new Date("2026-09-01"),
      }),
      breakdownRow({
        channel: "organic",
        pct: 44,
        capturedAt: new Date("2026-09-10"),
      }),
      breakdownRow({
        channel: "direct",
        pct: 56,
        capturedAt: new Date("2026-09-10"),
      }),
    ];

    expect(trafficChannelSplitForApp(rows, "basin")).toEqual([
      { channel: "organic", pct: 44 },
      { channel: "direct", pct: 56 },
    ]);
  });
});

describe("trafficChannelSplitAcrossApps", () => {
  it("returns an empty array when no app has a breakdown yet", () => {
    expect(trafficChannelSplitAcrossApps([], ["basin", "markpost"])).toEqual(
      [],
    );
  });

  it("averages the latest channel pct across apps that have data", () => {
    const rows = [
      breakdownRow({ slug: "basin", channel: "organic", pct: 40 }),
      breakdownRow({ slug: "markpost", channel: "organic", pct: 60 }),
    ];

    expect(
      trafficChannelSplitAcrossApps(rows, ["basin", "markpost", "wanderist"]),
    ).toEqual([{ channel: "organic", pct: 50 }]);
  });
});

describe("computeAppStatus", () => {
  it("reports NOT SYNCED (muted) when no sync_status row exists yet", () => {
    expect(computeAppStatus([], "basin")).toEqual({
      label: "NOT SYNCED",
      tone: "muted",
    });
  });

  it("reports LIVE (ok) when every vendor is healthy", () => {
    const rows = [
      syncRow({ vendor: "ga4", ok: true }),
      syncRow({ vendor: "stripe", ok: true }),
    ];
    expect(computeAppStatus(rows, "basin")).toEqual({
      label: "LIVE",
      tone: "ok",
    });
  });

  it("counts failing vendors (danger) when any sync is unhealthy", () => {
    const rows = [
      syncRow({ vendor: "ga4", ok: true }),
      syncRow({ vendor: "stripe", ok: false }),
      syncRow({ vendor: "sentry", ok: false }),
    ];
    expect(computeAppStatus(rows, "basin")).toEqual({
      label: "2 ISSUES",
      tone: "danger",
    });
  });
});

describe("integrationHealthForApp", () => {
  it("returns null health fields for a configured vendor that's never synced", () => {
    const configRows = [
      integrationConfigRow({ vendor: "stripe", enabled: true }),
    ];
    expect(integrationHealthForApp(configRows, [], "basin")).toEqual([
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

    expect(integrationHealthForApp(configRows, syncRows, "basin")).toEqual([
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
});

describe("alertsForApp", () => {
  it("returns no alerts when every vendor is healthy", () => {
    expect(alertsForApp([syncRow({ ok: true })], "basin")).toEqual([]);
  });

  it("builds one alert per failing vendor, falling back to a generic message", () => {
    const rows = [syncRow({ vendor: "stripe", ok: false, error: null })];
    expect(alertsForApp(rows, "basin")).toEqual([
      {
        slug: "basin",
        vendor: "stripe",
        message: "stripe sync is failing",
        occurredAt: rows[0].lastRunAt?.toISOString(),
      },
    ]);
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
