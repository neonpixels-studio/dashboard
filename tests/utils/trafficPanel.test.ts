import { describe, expect, it } from "vitest";
import { buildTrafficPanelData } from "../../app/utils/trafficPanel";
import type { AppDetailResponse } from "../../shared/types/dashboard";

function detailFixture(
  overrides: Partial<AppDetailResponse> = {},
): AppDetailResponse {
  return {
    slug: "basin",
    metrics: [],
    series: [],
    trafficBreakdown: [],
    syndication: [],
    alerts: [],
    sources: [],
    lastSyncedAt: null,
    ...overrides,
  };
}

describe("buildTrafficPanelData", () => {
  it("returns every field empty for a null detail (composable not loaded yet)", () => {
    expect(buildTrafficPanelData(null)).toEqual({
      stats: [],
      delta: "—",
      path: "",
      lists: [],
    });
  });

  it("returns empty stats/delta/path/lists when nothing has synced, never fabricated numbers", () => {
    expect(buildTrafficPanelData(detailFixture())).toEqual({
      stats: [],
      delta: "—",
      path: "",
      lists: [],
    });
  });

  it("builds the headline stat, delta, sparkline path, and traffic-source list from real data", () => {
    const detail = detailFixture({
      metrics: [
        {
          metric: "sessions",
          period: "30d",
          value: 8612,
          capturedAt: "2026-09-19T00:00:00.000Z",
        },
      ],
      series: [
        {
          metric: "sessions",
          period: "30d",
          points: [
            { capturedAt: "2026-08-20T00:00:00.000Z", value: 7000 },
            { capturedAt: "2026-09-19T00:00:00.000Z", value: 8612 },
          ],
        },
        {
          metric: "sessions",
          period: "daily",
          points: [
            { capturedAt: "2026-09-18T00:00:00.000Z", value: 250 },
            { capturedAt: "2026-09-19T00:00:00.000Z", value: 310 },
          ],
        },
      ],
      trafficBreakdown: [
        { channel: "organic", pct: 41 },
        { channel: "direct", pct: 60 },
      ],
    });

    const data = buildTrafficPanelData(detail);

    expect(data.stats).toEqual([{ label: "SESSIONS · 30D", value: "8,612" }]);
    expect(data.delta).toBe("▲ 23.0%");
    expect(data.path.length).toBeGreaterThan(0);
    // Sorted largest share first, not the API's row order.
    expect(data.lists).toEqual([
      {
        title: "TRAFFIC SOURCES",
        items: [
          { label: "Direct", value: "60%" },
          { label: "Organic search", value: "41%" },
        ],
      },
    ]);
  });
});
