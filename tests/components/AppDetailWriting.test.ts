import { describe, expect, it, vi } from "vitest";
import AppDetailWriting from "../../app/components/AppDetailWriting.vue";
import MetricTile from "../../app/components/MetricTile.vue";
import MetricTileSkeleton from "../../app/components/MetricTileSkeleton.vue";
import DataErrorState from "../../app/components/DataErrorState.vue";
import SectionLabel from "../../app/components/SectionLabel.vue";
import SyndicationPostMatrix from "../../app/components/SyndicationPostMatrix.vue";
import TrafficPanel from "../../app/components/TrafficPanel.vue";
import SourcesFooter from "../../app/components/SourcesFooter.vue";
import { findAppBySlug } from "../../app/config/apps";
import { toAppDetailViewModel } from "../../app/utils/appViewModel";
import {
  mountDetailTemplate,
  type MountDetailOptions,
} from "./support/mountDetailTemplate";
import { appDetailFixture } from "../support/appDetailFixture";
import type { AppDetailResponse } from "../../shared/types/dashboard";

const app = findAppBySlug("danholloran")!;

function mountDetail({
  detail = null,
  ...options
}: { detail?: AppDetailResponse | null } & MountDetailOptions = {}) {
  return mountDetailTemplate(
    AppDetailWriting,
    toAppDetailViewModel(app, detail),
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
      metric: "posts",
      period: "current",
      value: 41,
      capturedAt: "2026-09-19T00:00:00.000Z",
    },
  ],
  syndication: [
    {
      postRef: "shipping-a-nuxt-site",
      cells: [
        {
          platform: "medium",
          status: "synced",
          syncedAt: "2026-09-19T00:00:00.000Z",
        },
        {
          platform: "hashnode",
          status: "synced",
          syncedAt: "2026-09-19T00:00:00.000Z",
        },
        {
          platform: "zyvop",
          status: "failed",
          syncedAt: "2026-09-18T00:00:00.000Z",
        },
      ],
    },
    {
      postRef: "missouri-ozarks",
      cells: [{ platform: "medium", status: "pending", syncedAt: null }],
    },
  ],
  trafficBreakdown: [{ channel: "direct", pct: 38 }],
  sources: [
    {
      vendor: "medium",
      ok: true,
      lastRunAt: null,
      lastSuccessAt: "2026-09-19T00:00:00.000Z",
      error: null,
    },
  ],
});

describe("AppDetailWriting", () => {
  it("shows four skeleton tiles while pending", () => {
    const wrapper = mountDetail({ pending: true });
    expect(wrapper.findAllComponents(MetricTileSkeleton)).toHaveLength(4);
    expect(wrapper.findAllComponents(MetricTile)).toHaveLength(0);
  });

  it("shows the error state wired to refresh", async () => {
    const refresh = vi.fn();
    const wrapper = mountDetail({ error: new Error("down"), refresh });
    expect(wrapper.findComponent(DataErrorState).exists()).toBe(true);
    await wrapper
      .findComponent(DataErrorState)
      .find(".retry-btn")
      .trigger("click");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("renders the reach section label", () => {
    const wrapper = mountDetail({ detail: LOADED_DETAIL });
    expect(
      wrapper
        .findAllComponents(SectionLabel)
        .map((node) => node.props("label")),
    ).toEqual(["REACH", "TRAFFIC"]);
  });

  it("renders sessions, posts, platforms-live, and cross-post-failures tiles from real data", () => {
    const wrapper = mountDetail({ detail: LOADED_DETAIL });
    const tiles = wrapper.findAllComponents(MetricTile);
    expect(tiles.map((tile) => tile.props("label"))).toEqual([
      "SESSIONS",
      "POSTS",
      "PLATFORMS LIVE",
      "CROSS-POST FAILURES",
    ]);
    expect(tiles[0]!.props("value")).toBe("6,104");
    expect(tiles[1]!.props("value")).toBe("41");
    // medium and hashnode each have a synced cell — 2 live platforms.
    expect(tiles[2]!.props("value")).toBe("2");
    // one failed cell (zyvop on the first post).
    expect(tiles[3]!.props("value")).toBe("1");
    expect(tiles[3]!.props("tone")).toBe("warn");
  });

  it("never renders a retry button — no retry endpoint exists yet for it to call", () => {
    // Real failures exist in LOADED_DETAIL; a button that appeared here with
    // no handler behind it would be worse than no button at all.
    expect(
      mountDetail({ detail: LOADED_DETAIL }).find(".retry-btn").exists(),
    ).toBe(false);
  });

  it("shows an all-synced, untoned tile when nothing has failed", () => {
    const detail = appDetailFixture({
      syndication: [
        {
          postRef: "solo-post",
          cells: [
            {
              platform: "medium",
              status: "synced",
              syncedAt: "2026-09-19T00:00:00.000Z",
            },
          ],
        },
      ],
    });
    const wrapper = mountDetail({ detail });
    const failuresTile = wrapper
      .findAllComponents(MetricTile)
      .find((tile) => tile.props("label") === "CROSS-POST FAILURES")!;
    expect(failuresTile.props("value")).toBe("0");
    expect(failuresTile.props("sub")).toBe("All synced");
    expect(failuresTile.props("tone")).toBeUndefined();

    const platformsTile = wrapper
      .findAllComponents(MetricTile)
      .find((tile) => tile.props("label") === "PLATFORMS LIVE")!;
    expect(platformsTile.props("sub")).toBe("1 platform posted to");
  });

  it("derives the platform column set from the real syndication rows, sorted", () => {
    const wrapper = mountDetail({ detail: LOADED_DETAIL });
    const matrix = wrapper.findComponent(SyndicationPostMatrix);
    expect(matrix.props("platforms")).toEqual(["hashnode", "medium", "zyvop"]);
  });

  it("builds one matrix row per post, using postRef as the title and filling a not-posted cell for a missing platform", () => {
    const wrapper = mountDetail({ detail: LOADED_DETAIL });
    const posts = wrapper
      .findComponent(SyndicationPostMatrix)
      .props("posts") as {
      title: string;
      cells: { label: string; tone: string }[];
    }[];
    expect(posts).toHaveLength(2);
    expect(posts[0]!.title).toBe("shipping-a-nuxt-site");
    // Column order matches platforms: hashnode, medium, zyvop.
    expect(posts[0]!.cells.map((cell) => cell.tone)).toEqual([
      "live",
      "live",
      "failed",
    ]);

    expect(posts[1]!.title).toBe("missouri-ozarks");
    expect(posts[1]!.cells.map((cell) => cell.tone)).toEqual([
      "off",
      "queued",
      "off",
    ]);
  });

  it("passes the app and real traffic data through to the traffic panel", () => {
    const wrapper = mountDetail({ detail: LOADED_DETAIL });
    const trafficPanel = wrapper.findComponent(TrafficPanel);
    expect(trafficPanel.props("app")).toStrictEqual(
      expect.objectContaining({ slug: "danholloran" }),
    );
    expect(trafficPanel.props("lists")).toEqual([
      { title: "TRAFFIC SOURCES", items: [{ label: "Direct", value: "38%" }] },
    ]);
  });

  it("shows real per-vendor sync chips in the sources footer", () => {
    const wrapper = mountDetail({ detail: LOADED_DETAIL });
    expect(wrapper.findComponent(SourcesFooter).props("sources")).toEqual([
      { label: "MEDIUM · 19 SEP 2026", tone: "ok" },
    ]);
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
