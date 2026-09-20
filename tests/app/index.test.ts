import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import IndexPage from "../../app/pages/index.vue";
import ControlTopBar from "../../app/components/ControlTopBar.vue";
import BrandMark from "../../app/components/BrandMark.vue";
import SectionLabel from "../../app/components/SectionLabel.vue";
import MetricTileSkeleton from "../../app/components/MetricTileSkeleton.vue";
import SkeletonBlock from "../../app/components/SkeletonBlock.vue";
import DataErrorState from "../../app/components/DataErrorState.vue";
import AppIcon from "../../app/components/AppIcon.vue";
import SparkLine from "../../app/components/SparkLine.vue";
import StatList from "../../app/components/StatList.vue";
import PropertySessionsChart from "../../app/components/PropertySessionsChart.vue";
import AxisRow from "../../app/components/AxisRow.vue";
import PropertyCard from "../../app/components/PropertyCard.vue";
import PropertyCardMetricsSkeleton from "../../app/components/PropertyCardMetricsSkeleton.vue";
import RollupMrrTile from "../../app/components/RollupMrrTile.vue";
import RollupStatTile from "../../app/components/RollupStatTile.vue";
import RollupIssuesTile from "../../app/components/RollupIssuesTile.vue";
import RollupValueRow from "../../app/components/RollupValueRow.vue";
import type { OverviewResponse } from "../../shared/types/dashboard";

// index.vue imports useOverview directly (not via the global useFetch
// auto-import), so it's mocked at the module boundary the same way
// overview.get.test.ts mocks dashboardQueries — the composable's own
// contract is covered by tests/composables/useOverview.test.ts.
const mockUseOverview = vi.fn();
vi.mock("../../app/composables/useOverview", () => ({
  useOverview: () => mockUseOverview(),
}));

const GLOBAL_COMPONENTS = {
  ControlTopBar,
  BrandMark,
  SectionLabel,
  MetricTileSkeleton,
  SkeletonBlock,
  DataErrorState,
  AppIcon,
  SparkLine,
  StatList,
  PropertySessionsChart,
  AxisRow,
  PropertyCard,
  PropertyCardMetricsSkeleton,
  RollupMrrTile,
  RollupStatTile,
  RollupIssuesTile,
  RollupValueRow,
};

// ControlTopBar/PropertyCard rely on Nuxt's <NuxtLink> and @clerk/nuxt's
// <UserButton> — stubbed the same way ControlTopBar.test.ts and
// PropertyCard.test.ts stub them.
const GLOBAL_STUBS = {
  NuxtLink: { props: ["to"], template: "<a :href='to'><slot /></a>" },
  UserButton: {
    name: "UserButton",
    props: ["signOutRedirectUrl", "appearance"],
    template: "<div class='user-button-stub' />",
  },
};

// Every number here is deliberately different from the "/" mock's old
// hardcoded values (1284/312/48.2K/7, 96/141/75, 44/31/25%) — if a future
// change reverts a tile to a hardcoded literal, these assertions catch it
// even though the literal would otherwise look plausible.
function overviewFixture(
  overrides: Partial<OverviewResponse> = {},
): OverviewResponse {
  return {
    mrr: {
      value: 2145,
      period: "current",
      capturedAt: "2026-09-19T00:00:00.000Z",
      delta: { value: 163, pct: 8.2 },
      byApp: [
        { slug: "basin", value: 900 },
        { slug: "markpost", value: 1245 },
      ],
      series: [
        { capturedAt: "2026-08-20T00:00:00.000Z", value: 1982 },
        { capturedAt: "2026-09-19T00:00:00.000Z", value: 2145 },
      ],
    },
    activeSubscribers: {
      value: 401,
      period: "current",
      capturedAt: "2026-09-19T00:00:00.000Z",
      delta: { value: 22, pct: 5.8 },
      byApp: [
        { slug: "wanderist", value: 55 },
        { slug: "basin", value: 126 },
        { slug: "markpost", value: 220 },
      ],
    },
    sessions30d: {
      value: 61300,
      period: "30d",
      capturedAt: "2026-09-19T00:00:00.000Z",
      delta: { value: -890, pct: -1.4 },
      bySource: [
        { channel: "direct", pct: 28 },
        { channel: "organic", pct: 51 },
        { channel: "referral", pct: 15 },
        { channel: "other", pct: 6 },
      ],
    },
    openIssues: {
      value: 11,
      period: "current",
      capturedAt: "2026-09-19T00:00:00.000Z",
      delta: { value: 3, pct: 37.5 },
      byApp: [
        { slug: "markpost", value: 4 },
        { slug: "basin", value: 6 },
        { slug: "danholloran", value: 1 },
      ],
    },
    lastSyncedAt: "2026-09-20T11:56:00.000Z",
    ...overrides,
  };
}

function mockOverview(overrides: {
  data?: OverviewResponse | null;
  pending?: boolean;
  error?: Error | null;
  refresh?: () => void;
}) {
  mockUseOverview.mockReturnValue({
    data: ref(overrides.data ?? null),
    pending: ref(overrides.pending ?? false),
    error: ref(overrides.error ?? null),
    refresh: overrides.refresh ?? vi.fn(),
  });
}

function mountPage() {
  return mount(IndexPage, {
    global: { components: GLOBAL_COMPONENTS, stubs: GLOBAL_STUBS },
  });
}

beforeEach(() => {
  vi.stubGlobal("useHead", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("index.vue rollup tiles", () => {
  it("shows four loading skeletons while useOverview is pending, never fabricated numbers", () => {
    mockOverview({ pending: true });

    const wrapper = mountPage();

    expect(wrapper.findAllComponents(MetricTileSkeleton)).toHaveLength(4);
    expect(wrapper.findComponent(DataErrorState).exists()).toBe(false);
    expect(wrapper.find(".rollup-value").exists()).toBe(false);
  });

  it("shows the loaded-but-empty state gracefully — dashes and empty messages, not skeletons or fabricated numbers — for useFetch's idle case", () => {
    // pending: false, error: null, data: null is a real state useFetch can
    // be in (e.g. SSR opted out and the client fetch hasn't kicked off
    // yet), distinct from both the pending and error branches.
    mockOverview({});

    const wrapper = mountPage();

    expect(wrapper.findAllComponents(MetricTileSkeleton)).toHaveLength(0);
    expect(wrapper.findComponent(DataErrorState).exists()).toBe(false);
    const values = wrapper.findAll(".rollup-value").map((node) => node.text());
    expect(values).toEqual(["—", "—", "—", "—"]);
    expect(wrapper.find(".delta").exists()).toBe(false);
  });

  it("shows one error state spanning the grid on failure, wired to the composable's refresh", async () => {
    const refresh = vi.fn();
    mockOverview({ error: new Error("network down"), refresh });

    const wrapper = mountPage();
    const errorState = wrapper.findComponent(DataErrorState);

    expect(errorState.exists()).toBe(true);
    expect(wrapper.findAllComponents(MetricTileSkeleton)).toHaveLength(0);
    expect(wrapper.find(".rollup-value").exists()).toBe(false);

    await errorState.find(".retry-btn").trigger("click");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("renders live values and deltas for all four tiles from the fetched data", () => {
    mockOverview({ data: overviewFixture() });

    const text = mountPage().text();

    expect(text).toContain("$2,145");
    expect(text).toContain("▲ 8.2%");
    expect(text).toContain("401");
    expect(text).toContain("▲ 22");
    expect(text).toContain("61.3K");
    expect(text).toContain("▼ 1.4%");
    expect(text).toContain("11");
    expect(text).toContain("+3 since yesterday");
  });

  it("draws the MRR sparkline from the real series, not the old hardcoded bezier path", () => {
    mockOverview({ data: overviewFixture() });

    const sparkline = mountPage().findComponent(SparkLine);

    expect(sparkline.exists()).toBe(true);
    expect(sparkline.props("path")).not.toContain("M0 64 C1.8 63.4 7.3 61.4");
    expect(sparkline.props("path").length).toBeGreaterThan(0);
  });

  it("hides the sparkline and shows an empty state when fewer than two mrr points have synced", () => {
    const fixture = overviewFixture();
    mockOverview({
      data: { ...fixture, mrr: { ...fixture.mrr, series: [] } },
    });

    const wrapper = mountPage();

    expect(wrapper.findComponent(SparkLine).exists()).toBe(false);
    expect(wrapper.text()).toContain(
      "Not enough synced data for a trend line yet.",
    );
  });

  it("renders the open issues empty state gracefully — a dash, not a fabricated count — when Sentry hasn't synced yet", () => {
    mockOverview({
      data: overviewFixture({
        openIssues: {
          value: null,
          period: null,
          capturedAt: null,
          delta: null,
          byApp: [],
        },
      }),
    });

    const wrapper = mountPage();
    const issuesTile = wrapper.find(".issues-tile");

    expect(issuesTile.find(".rollup-value").text()).toBe("—");
    expect(wrapper.text()).toContain("No issue data synced yet.");
  });

  it("sorts the active subscribers StatList by property config order, not the API's row order", () => {
    mockOverview({ data: overviewFixture() });

    const wrapper = mountPage();
    const items = wrapper.findAllComponents(StatList)[0]!.props("items") as {
      label: string;
    }[];

    expect(items.map((item) => item.label)).toEqual([
      "basin.fm",
      "markpost.io",
      "wanderist.io",
    ]);
  });

  it("sorts the sessions traffic-source split by share, largest first", () => {
    mockOverview({ data: overviewFixture() });

    const wrapper = mountPage();
    const sessionsStatList = wrapper
      .findAllComponents(StatList)
      .find((statList) =>
        (statList.props("items") as { label: string }[]).some((item) =>
          item.label.includes("Organic"),
        ),
      )!;
    const items = sessionsStatList.props("items") as { label: string }[];

    expect(items.map((item) => item.label)).toEqual([
      "Organic search",
      "Direct",
      "Referral & social",
      "Other",
    ]);
  });

  it("keeps the sync meta blank on the initial render (no relative-time hydration mismatch), then fills it in after mount", async () => {
    mockOverview({ data: overviewFixture() });

    const wrapper = mountPage();
    // Read before the post-mount watcher's microtask flushes — this is what
    // SSR and the client's first paint show, same reasoning as
    // DataErrorState.test.ts's equivalent case.
    expect(wrapper.findComponent(SectionLabel).props("meta")).toBeUndefined();

    await nextTick();

    expect(wrapper.findComponent(SectionLabel).props("meta")).toMatch(
      /^SYNCED .+ AGO · \d{2} SEP 2026$/,
    );
  });

  it("matches its rollup-grid snapshot with live data", () => {
    mockOverview({ data: overviewFixture() });

    // Scoped to .rollup-grid, not the whole page — the sync meta (whose
    // text depends on wall-clock time via the mount-timing test above)
    // renders in a sibling SectionLabel outside this element entirely.
    expect(mountPage().find(".rollup-grid").html()).toMatchSnapshot();
  });
});
