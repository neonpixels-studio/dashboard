import { describe, expect, it } from "vitest";
import {
  buildSessionsAriaLabel,
  buildSessionsAxisLabels,
  buildSessionsChartSeries,
  buildSessionsTotals,
} from "../../app/utils/overviewSessions";
import { findAppBySlug } from "../../app/config/apps";
import type { PropertySessions } from "../../shared/types/overviewSessions";

function daily(values: number[]) {
  return values.map((value, index) => ({
    capturedAt: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    value,
  }));
}

const PROPERTIES: PropertySessions[] = [
  {
    slug: "markpost",
    daily: daily([10, 20, 30]),
    total30d: 6200,
    delta: { value: 1700, pct: 38 },
  },
  {
    slug: "basin",
    daily: daily([100, 200, 300, 400]),
    total30d: 8600,
    delta: { value: -100, pct: -1.2 },
  },
  { slug: "farflung", daily: daily([5]), total30d: null, delta: null },
];

describe("buildSessionsChartSeries", () => {
  it("draws one accent-colored line per property with at least two points", () => {
    const series = buildSessionsChartSeries(PROPERTIES);

    expect(series.map((line) => line.slug)).toEqual(["basin", "markpost"]);
    expect(series[0]?.color).toBe(findAppBySlug("basin")?.accent);
    expect(series[0]?.path).toMatch(/^M0\.00 /);
  });

  it("shares one y-scale: a smaller property sits below a larger one's line", () => {
    const [basin, markpost] = buildSessionsChartSeries(PROPERTIES);

    // Larger y is lower on screen; markpost peaks at 30 vs basin's 400.
    expect(markpost?.endY).toBeGreaterThan(basin?.endY ?? 0);
  });

  it("places each line by date, so a property that stopped syncing ends early", () => {
    const series = buildSessionsChartSeries([
      { slug: "basin", daily: daily([1, 2, 3, 4]), total30d: 1, delta: null },
      { slug: "markpost", daily: daily([1, 2]), total30d: 1, delta: null },
    ]);

    expect(series[0]?.path).toMatch(/^M0\.00 .* L900\.00 /);
    expect(series[1]?.path).toMatch(/^M0\.00 .* L300\.00 [\d.]+$/);
    expect(series[0]?.endX).toBe(900);
    expect(series[1]?.endX).toBe(300);
  });

  it("keeps a gappy property's points on their own days", () => {
    const gappy = [daily([5, 6, 7, 8])[0], daily([5, 6, 7, 8])[3]].filter(
      (point) => point !== undefined,
    );
    const series = buildSessionsChartSeries([
      { slug: "basin", daily: daily([1, 2, 3, 4]), total30d: 1, delta: null },
      { slug: "markpost", daily: gappy, total30d: 1, delta: null },
    ]);

    expect(series[1]?.path).toMatch(/^M0\.00 .* L900\.00 /);
    expect(series[1]?.path).not.toContain("L300.00");
  });

  it("doesn't let a long-stale property stretch the axis past the 30-day window", () => {
    const stale = daily([1, 2]).map((point) => ({
      ...point,
      capturedAt: point.capturedAt.replace("2026-09", "2026-06"),
    }));
    const recent = Array.from({ length: 30 }, (_, index) => ({
      capturedAt: new Date(Date.UTC(2026, 8, index + 1)).toISOString(),
      value: index,
    }));
    const series = buildSessionsChartSeries([
      { slug: "basin", daily: recent, total30d: 1, delta: null },
      { slug: "markpost", daily: stale, total30d: 1, delta: null },
    ]);

    expect(series.map((line) => line.slug)).toEqual(["basin"]);
    expect(series[0]?.path).toMatch(/^M0\.00 .* L900\.00 /);
  });

  it("draws nothing for a single shared day rather than dividing by zero", () => {
    const sameDay = [
      { capturedAt: "2026-09-01T01:00:00.000Z", value: 1 },
      { capturedAt: "2026-09-01T09:00:00.000Z", value: 2 },
    ];

    expect(
      buildSessionsChartSeries([
        { slug: "basin", daily: sameDay, total30d: 1, delta: null },
      ]),
    ).toEqual([]);
  });

  it("returns no series when nothing has enough history", () => {
    expect(buildSessionsChartSeries([])).toEqual([]);
    expect(
      buildSessionsChartSeries([PROPERTIES[2] as PropertySessions]),
    ).toEqual([]);
  });
});

describe("buildSessionsAxisLabels", () => {
  it("labels the axis from every drawable property's days", () => {
    expect(buildSessionsAxisLabels(PROPERTIES)).toEqual([
      "01 SEP",
      "02 SEP",
      "04 SEP",
    ]);
  });

  it("spans the union of days when properties cover different dates", () => {
    const later = daily([1, 2]).map((point, index) => ({
      ...point,
      capturedAt: `2026-09-${String(index + 10).padStart(2, "0")}T00:00:00.000Z`,
    }));

    expect(
      buildSessionsAxisLabels([
        { slug: "basin", daily: daily([1, 2]), total30d: 1, delta: null },
        { slug: "markpost", daily: later, total30d: 1, delta: null },
      ]),
    ).toEqual(["01 SEP", "02 SEP", "11 SEP"]);
  });

  it("is empty with no drawable series", () => {
    expect(buildSessionsAxisLabels([])).toEqual([]);
  });
});

describe("buildSessionsAriaLabel", () => {
  it("counts only the properties actually drawn", () => {
    expect(buildSessionsAriaLabel(PROPERTIES)).toBe(
      "Daily sessions for 2 properties.",
    );
    expect(buildSessionsAriaLabel([PROPERTIES[0] as PropertySessions])).toBe(
      "Daily sessions for 1 property.",
    );
  });
});

describe("buildSessionsTotals", () => {
  it("lists properties by 30-day total, largest first, skipping unsynced ones", () => {
    const totals = buildSessionsTotals(PROPERTIES);

    expect(totals.map((item) => item.label)).toEqual([
      "basin.fm",
      "markpost.io",
    ]);
    expect(totals[0]).toMatchObject({
      value: "8.6K",
      delta: "▼ 1.2%",
      deltaTone: "muted",
      swatch: findAppBySlug("basin")?.accent,
    });
    expect(totals[1]).toMatchObject({ value: "6.2K", deltaTone: "ok" });
  });

  it("is empty when no property has a total yet", () => {
    expect(buildSessionsTotals([])).toEqual([]);
  });
});
