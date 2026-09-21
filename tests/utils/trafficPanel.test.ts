import { describe, expect, it } from "vitest";
import { buildTrafficPanelData } from "../../app/utils/trafficPanel";
import { appDetailFixture } from "../support/appDetailFixture";

describe("buildTrafficPanelData", () => {
  it("returns every field empty for a null detail (composable not loaded yet)", () => {
    expect(buildTrafficPanelData(null)).toEqual({
      stats: [],
      delta: "—",
      path: "",
      axisLabels: [],
      lists: [],
    });
  });

  it("returns empty stats/delta/path/axisLabels/lists when nothing has synced, never fabricated numbers", () => {
    expect(buildTrafficPanelData(appDetailFixture())).toEqual({
      stats: [],
      delta: "—",
      path: "",
      axisLabels: [],
      lists: [],
    });
  });

  it("draws no chart or axis labels for a single daily point — same 2-point minimum as the dedicated sessions charts", () => {
    const detail = appDetailFixture({
      series: [
        {
          metric: "sessions",
          period: "daily",
          points: [{ capturedAt: "2026-09-19T00:00:00.000Z", value: 250 }],
        },
      ],
    });

    const data = buildTrafficPanelData(detail);

    expect(data.path).toBe("");
    expect(data.axisLabels).toEqual([]);
  });

  it("builds the headline stat, delta, sparkline path, and traffic-source list from real data", () => {
    const detail = appDetailFixture({
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
    // A 2-point series has no distinct middle — first and last only, not a
    // repeated date (see buildAxisLabels' own dedup comment).
    expect(data.axisLabels).toEqual(["18 SEP", "19 SEP"]);
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
