import { describe, expect, it, vi } from "vitest";
import AppDetailProduct from "../../app/components/AppDetailProduct.vue";
import MetricTile from "../../app/components/MetricTile.vue";
import MetricTileSkeleton from "../../app/components/MetricTileSkeleton.vue";
import DataErrorState from "../../app/components/DataErrorState.vue";
import AppAlert from "../../app/components/AppAlert.vue";
import SectionLabel from "../../app/components/SectionLabel.vue";
import BarMeter from "../../app/components/BarMeter.vue";
import TrafficPanel from "../../app/components/TrafficPanel.vue";
import SourcesFooter from "../../app/components/SourcesFooter.vue";
import PropertySessionsChart from "../../app/components/PropertySessionsChart.vue";
import { findAppBySlug } from "../../app/config/apps";
import { toAppDetailViewModel } from "../../app/utils/appViewModel";
import {
  mountDetailTemplate,
  type MountDetailOptions,
} from "./support/mountDetailTemplate";
import { appDetailFixture } from "../support/appDetailFixture";
import type { AppDetailResponse } from "../../shared/types/dashboard";

const app = findAppBySlug("basin")!;

function mountDetail({
  detail = null,
  ...options
}: { detail?: AppDetailResponse | null } & MountDetailOptions = {}) {
  return mountDetailTemplate(
    AppDetailProduct,
    toAppDetailViewModel(app, detail),
    options,
  );
}

const LOADED_DETAIL = appDetailFixture({
  metrics: [
    {
      metric: "mrr",
      period: "current",
      value: 412,
      capturedAt: "2026-09-19T00:00:00.000Z",
    },
    {
      metric: "active_subscribers",
      period: "current",
      value: 96,
      capturedAt: "2026-09-19T00:00:00.000Z",
    },
    {
      metric: "users",
      period: "current",
      value: 1204,
      capturedAt: "2026-09-19T00:00:00.000Z",
    },
    // open_issues intentionally omitted — asserts the "not synced yet"
    // placeholder, not just the happy path.
  ],
  series: [
    {
      metric: "sessions",
      period: "daily",
      points: [
        { capturedAt: "2026-09-18T00:00:00.000Z", value: 100 },
        { capturedAt: "2026-09-19T00:00:00.000Z", value: 140 },
      ],
    },
    // metric_snapshot is append-only (server/integrations/persist.ts inserts,
    // never upserts), so a "current"-period metric like mrr genuinely
    // accumulates its own history across repeated polls — this proves the
    // tile-delta path actually renders a real (non-dash) delta end to end,
    // not just in metricTile.test.ts's unit-level coverage of the same math.
    {
      metric: "mrr",
      period: "current",
      points: [
        { capturedAt: "2026-08-20T00:00:00.000Z", value: 380 },
        { capturedAt: "2026-09-19T00:00:00.000Z", value: 412 },
      ],
    },
  ],
  trafficBreakdown: [{ channel: "organic", pct: 61 }],
  alerts: [
    {
      slug: "basin",
      vendor: "sentry",
      message: "401 Unauthorized",
      occurredAt: null,
    },
  ],
  sources: [
    {
      vendor: "ga4",
      ok: true,
      lastRunAt: "2026-09-19T00:00:00.000Z",
      lastSuccessAt: "2026-09-19T00:00:00.000Z",
      error: null,
    },
  ],
  lastSyncedAt: "2026-09-19T00:00:00.000Z",
});

describe("AppDetailProduct", () => {
  it("shows four skeleton tiles and no real content while pending", () => {
    const wrapper = mountDetail({ pending: true });
    expect(wrapper.findAllComponents(MetricTileSkeleton)).toHaveLength(4);
    expect(wrapper.findAllComponents(MetricTile)).toHaveLength(0);
    expect(wrapper.findComponent(DataErrorState).exists()).toBe(false);
  });

  it("shows the error state and hides the tiles", () => {
    const wrapper = mountDetail({ error: new Error("network down") });
    expect(wrapper.findComponent(DataErrorState).exists()).toBe(true);
    expect(wrapper.findAllComponents(MetricTile)).toHaveLength(0);
  });

  it("calls refresh when the error state's retry is clicked", async () => {
    const refresh = vi.fn();
    const wrapper = mountDetail({ error: new Error("boom"), refresh });
    await wrapper
      .findComponent(DataErrorState)
      .find(".retry-btn")
      .trigger("click");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("renders MRR, active subscribers, users, and open issues tiles from real data", () => {
    const wrapper = mountDetail({ detail: LOADED_DETAIL });
    const tiles = wrapper.findAllComponents(MetricTile);
    expect(tiles).toHaveLength(4);
    expect(tiles.map((tile) => tile.props("label"))).toEqual([
      "MRR",
      "ACTIVE SUBSCRIBERS",
      "USERS",
      "OPEN ISSUES",
    ]);
    expect(tiles[0]!.props("value")).toBe("$412");
    expect(tiles[2]!.props("value")).toBe("1,204");
  });

  it("renders a real, non-dash delta end to end when the metric has more than one synced point", () => {
    const wrapper = mountDetail({ detail: LOADED_DETAIL });
    const mrrTile = wrapper
      .findAllComponents(MetricTile)
      .find((tile) => tile.props("label") === "MRR")!;
    expect(mrrTile.props("delta")).toBe("▲ 8.4%");
    expect(mrrTile.props("deltaTone")).toBe("ok");
  });

  it("shows an honest not-synced placeholder for a metric with no data yet, never a fabricated zero", () => {
    const wrapper = mountDetail({ detail: LOADED_DETAIL });
    const openIssuesTile = wrapper
      .findAllComponents(MetricTile)
      .find((tile) => tile.props("label") === "OPEN ISSUES")!;
    expect(openIssuesTile.props("value")).toBe("—");
    expect(openIssuesTile.props("sub")).toBe("Not synced yet");
  });

  it("renders one AppAlert per real sync-failure alert", () => {
    const wrapper = mountDetail({ detail: LOADED_DETAIL });
    const alerts = wrapper.findAllComponents(AppAlert);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.props("tone")).toBe("err");
    expect(alerts[0]!.text()).toContain("401 Unauthorized");
  });

  it("renders no alerts list when there are none", () => {
    const wrapper = mountDetail({ detail: appDetailFixture() });
    expect(wrapper.findAllComponents(AppAlert)).toHaveLength(0);
  });

  it("builds the sessions chart from the real daily series, labeled for this app", () => {
    const wrapper = mountDetail({ detail: LOADED_DETAIL });
    const chart = wrapper.findComponent(PropertySessionsChart);
    expect(chart.props("series")).toHaveLength(1);
    expect(chart.props("series")[0].slug).toBe("basin");
    expect(chart.props("series")[0].path.length).toBeGreaterThan(0);
    expect(chart.attributes("aria-label")).toContain("basin.fm");
  });

  it("renders an empty sessions chart when fewer than two daily points exist", () => {
    const wrapper = mountDetail({ detail: appDetailFixture() });
    expect(
      wrapper.findComponent(PropertySessionsChart).props("series"),
    ).toEqual([]);
  });

  it("wires real traffic data and per-integration sources into TrafficPanel and SourcesFooter", () => {
    const wrapper = mountDetail({ detail: LOADED_DETAIL });
    const trafficPanel = wrapper.findComponent(TrafficPanel);
    expect(trafficPanel.props("app")).toStrictEqual(
      expect.objectContaining({ slug: "basin" }),
    );
    // LOADED_DETAIL only synced a daily sessions series (for the sparkline),
    // not the sessions/30d current-value row — stats stays empty rather than
    // fabricating a headline number from data that hasn't synced.
    expect(trafficPanel.props("stats")).toEqual([]);
    expect(trafficPanel.props("delta")).toBe("—");
    expect(trafficPanel.props("path").length).toBeGreaterThan(0);
    expect(trafficPanel.props("lists")).toEqual([
      {
        title: "TRAFFIC SOURCES",
        items: [{ label: "Organic search", value: "61%" }],
      },
    ]);

    const sourcesFooter = wrapper.findComponent(SourcesFooter);
    expect(sourcesFooter.props("sources")).toEqual([
      { label: "GA4 · 19 SEP 2026", tone: "ok" },
    ]);
  });

  it("still renders the un-wired Stripe/Sentry/auth panels (no dedicated endpoint yet — see PR follow-up)", () => {
    const wrapper = mountDetail({ detail: LOADED_DETAIL });
    expect(wrapper.findAll(".transaction")).toHaveLength(4);
    expect(wrapper.findAll(".issue")).toHaveLength(3);
    const bars = wrapper.findAllComponents(BarMeter);
    expect(bars).toHaveLength(6);
    expect(bars.every((bar) => bar.props("color") === app.accent)).toBe(true);
    const labels = wrapper
      .findAllComponents(SectionLabel)
      .map((node) => node.props("label"));
    expect(labels).toEqual(["MONEY & HEALTH", "USERS & AUTH", "TRAFFIC"]);
  });

  it("matches its tile-grid snapshot", () => {
    // See AppDetailMarketing.test.ts's equivalent note — the full-component
    // snapshot is dominated by hardcoded SparkLine bezier paths; the tile
    // grid stays human-reviewable.
    expect(
      mountDetail({ detail: LOADED_DETAIL }).find(".tile-grid").html(),
    ).toMatchSnapshot();
  });
});
