import { describe, expect, it, vi } from "vitest";
import AppDetailMarketing from "../../app/components/AppDetailMarketing.vue";
import MetricTile from "../../app/components/MetricTile.vue";
import MetricTileSkeleton from "../../app/components/MetricTileSkeleton.vue";
import DataErrorState from "../../app/components/DataErrorState.vue";
import SparkLine from "../../app/components/SparkLine.vue";
import StatList from "../../app/components/StatList.vue";
import SourcesFooter from "../../app/components/SourcesFooter.vue";
import { findAppBySlug } from "../../app/config/apps";
import { toAppDetailViewModel } from "../../app/utils/appViewModel";
import {
  mountDetailTemplate,
  type MountDetailOptions,
} from "./support/mountDetailTemplate";
import { appDetailFixture } from "../support/appDetailFixture";
import type { AppDetailResponse } from "../../shared/types/dashboard";

function mountDetail(
  slug: string,
  {
    detail = null,
    ...options
  }: { detail?: AppDetailResponse | null } & MountDetailOptions = {},
) {
  return mountDetailTemplate(
    AppDetailMarketing,
    toAppDetailViewModel(findAppBySlug(slug)!, detail),
    options,
  );
}

const LOADED_DETAIL = appDetailFixture({
  metrics: [
    {
      metric: "sessions",
      period: "30d",
      value: 6104,
      capturedAt: "2026-09-19T00:00:00.000Z",
    },
    {
      metric: "open_issues",
      period: "current",
      value: 0,
      capturedAt: "2026-09-19T00:00:00.000Z",
    },
  ],
  series: [
    {
      metric: "sessions",
      period: "daily",
      points: [
        { capturedAt: "2026-09-18T00:00:00.000Z", value: 200 },
        { capturedAt: "2026-09-19T00:00:00.000Z", value: 260 },
      ],
    },
  ],
  trafficBreakdown: [
    { channel: "direct", pct: 38 },
    { channel: "organic", pct: 17 },
  ],
  sources: [
    {
      vendor: "ga4",
      ok: true,
      lastRunAt: null,
      lastSuccessAt: "2026-09-19T00:00:00.000Z",
      error: null,
    },
  ],
});

describe("AppDetailMarketing", () => {
  it("shows four skeleton tiles while pending", () => {
    const wrapper = mountDetail("grimicorn", { pending: true });
    expect(wrapper.findAllComponents(MetricTileSkeleton)).toHaveLength(4);
    expect(wrapper.findAllComponents(MetricTile)).toHaveLength(0);
  });

  it("shows the error state wired to refresh", async () => {
    const refresh = vi.fn();
    const wrapper = mountDetail("grimicorn", {
      error: new Error("down"),
      refresh,
    });
    expect(wrapper.findComponent(DataErrorState).exists()).toBe(true);
    await wrapper
      .findComponent(DataErrorState)
      .find(".retry-btn")
      .trigger("click");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("renders sessions, users, new users, and open issues tiles from real data", () => {
    const wrapper = mountDetail("grimicorn", { detail: LOADED_DETAIL });
    const tiles = wrapper.findAllComponents(MetricTile);
    expect(tiles.map((tile) => tile.props("label"))).toEqual([
      "SESSIONS",
      "USERS",
      "NEW USERS",
      "OPEN ISSUES",
    ]);
    expect(tiles[0]!.props("value")).toBe("6,104");
    // users/new_users never synced in this fixture — honest placeholders.
    expect(tiles[1]!.props("value")).toBe("—");
    expect(tiles[1]!.props("sub")).toBe("Not synced yet");
  });

  it("charts sessions in the app's accent color for a non-studio property", () => {
    const wrapper = mountDetail("grimicorn", { detail: LOADED_DETAIL });
    const sparkline = wrapper.findComponent(SparkLine);
    expect(sparkline.props("color")).toBe(findAppBySlug("grimicorn")!.accent);
    expect(sparkline.props("path").length).toBeGreaterThan(0);
  });

  it("charts sessions in neutral ink for the studio site", () => {
    const wrapper = mountDetail("neonpixels", { detail: LOADED_DETAIL });
    expect(wrapper.findComponent(SparkLine).props("color")).toBe("var(--ink)");
  });

  it("renders the real traffic-source split, sorted largest first, and omits the panel when there is none", () => {
    const wrapper = mountDetail("grimicorn", { detail: LOADED_DETAIL });
    const list = wrapper.findComponent(StatList);
    expect(list.props("items")).toEqual([
      { label: "Direct", value: "38%" },
      { label: "Organic search", value: "17%" },
    ]);

    const empty = mountDetail("grimicorn", { detail: appDetailFixture() });
    expect(empty.findComponent(StatList).exists()).toBe(false);
  });

  it("shows real per-integration sync chips in the sources footer", () => {
    const wrapper = mountDetail("grimicorn", { detail: LOADED_DETAIL });
    expect(wrapper.findComponent(SourcesFooter).props("sources")).toEqual([
      { label: "GA4 · 19 SEP 2026", tone: "ok" },
    ]);
  });

  it("matches its tile-grid snapshot", () => {
    // Snapshotting the full component would embed the hardcoded SparkLine
    // bezier paths (hundreds of unreadable coordinates) with no extra
    // coverage beyond the explicit assertions above; the tile grid is the
    // largest subtree that stays human-reviewable in a diff.
    expect(
      mountDetail("grimicorn", { detail: LOADED_DETAIL })
        .find(".tile-grid")
        .html(),
    ).toMatchSnapshot();
  });
});
