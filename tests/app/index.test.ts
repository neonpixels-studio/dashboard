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
import PropertyCardMetrics from "../../app/components/PropertyCardMetrics.vue";
import PropertyCardMetricsSkeleton from "../../app/components/PropertyCardMetricsSkeleton.vue";
import RollupMrrTile from "../../app/components/RollupMrrTile.vue";
import RollupStatTile from "../../app/components/RollupStatTile.vue";
import RollupIssuesTile from "../../app/components/RollupIssuesTile.vue";
import RollupValueRow from "../../app/components/RollupValueRow.vue";
import type {
  AppsResponse,
  OverviewResponse,
} from "../../shared/types/dashboard";

// index.vue imports useOverview/useApps directly (not via the global
// useFetch auto-import), so both are mocked at the module boundary the same
// way overview.get.test.ts mocks dashboardQueries — each composable's own
// contract is covered by its own tests/composables/*.test.ts.
const mockUseOverview = vi.fn();
vi.mock("../../app/composables/useOverview", () => ({
  useOverview: () => mockUseOverview(),
}));

const mockUseApps = vi.fn();
vi.mock("../../app/composables/useApps", () => ({
  useApps: () => mockUseApps(),
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
  PropertyCardMetrics,
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

function mockApps(overrides: {
  data?: AppsResponse | null;
  pending?: boolean;
  error?: Error | null;
  refresh?: () => void;
}) {
  mockUseApps.mockReturnValue({
    data: ref(overrides.data ?? null),
    pending: ref(overrides.pending ?? false),
    error: ref(overrides.error ?? null),
    refresh: overrides.refresh ?? vi.fn(),
  });
}

// Unlike mockApps (fire-and-forget per test), this hands back the live refs
// so a test can mutate them after mount — needed to simulate useFetch's
// real refresh lifecycle (data resets, pending flips, then error/data
// settles) rather than a single fixed snapshot.
function mockAppsLive(overrides: {
  data?: AppsResponse | null;
  pending?: boolean;
  error?: Error | null;
}) {
  const data = ref<AppsResponse | null>(overrides.data ?? null);
  const pending = ref(overrides.pending ?? false);
  const error = ref<Error | null>(overrides.error ?? null);
  mockUseApps.mockReturnValue({ data, pending, error, refresh: vi.fn() });
  return { data, pending, error };
}

function mountPage() {
  return mount(IndexPage, {
    global: { components: GLOBAL_COMPONENTS, stubs: GLOBAL_STUBS },
  });
}

beforeEach(() => {
  vi.stubGlobal("useHead", vi.fn());
  // Every rollup-tile test below only cares about useOverview; default the
  // property grid's fetch to its idle state so mounting the page doesn't
  // require every one of those tests to also stub useApps.
  mockApps({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Restored here (not in-body at the end of each fake-timers test) so a
  // failed assertion can't skip the restore and leave a frozen clock
  // running into whichever test happens to run next.
  vi.useRealTimers();
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

  it("hides the sparkline and shows an empty state when there is no mrr series yet", () => {
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

  it("still hides the sparkline with exactly one mrr point — a single point has no trend to draw", () => {
    const fixture = overviewFixture();
    mockOverview({
      data: {
        ...fixture,
        mrr: { ...fixture.mrr, series: [fixture.mrr.series[0]!] },
      },
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
    // Pinned rather than relying on the real clock: the fixture's
    // lastSyncedAt is a fixed timestamp, and formatRelativeTime treats
    // anything not yet in the past as "just now" (not "... ago") — running
    // this suite before 11:56 UTC on 2026-09-20 against the real clock
    // would make the "AGO" match below fail.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T11:59:00.000Z"));
    mockOverview({ data: overviewFixture() });

    const wrapper = mountPage();
    // Read before the post-mount watcher's microtask flushes — this is what
    // SSR and the client's first paint show, same reasoning as
    // DataErrorState.test.ts's equivalent case.
    expect(wrapper.findComponent(SectionLabel).props("meta")).toBeUndefined();

    await nextTick();

    expect(wrapper.findComponent(SectionLabel).props("meta")).toBe(
      "SYNCED 3M AGO · 20 SEP 2026",
    );
  });

  it("refreshes the relative sync time on an interval, not just once at mount", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T11:59:00.000Z"));
    mockOverview({
      data: overviewFixture({ lastSyncedAt: "2026-09-20T11:58:00.000Z" }),
    });

    const wrapper = mountPage();
    await nextTick();
    expect(wrapper.findComponent(SectionLabel).props("meta")).toContain(
      "1M AGO",
    );

    // Advances the fake clock by exactly one refresh interval — the label
    // must recompute from the CURRENT time on each tick, not just re-report
    // whatever it calculated once at mount.
    await vi.advanceTimersByTimeAsync(60_000);

    expect(wrapper.findComponent(SectionLabel).props("meta")).toContain(
      "2M AGO",
    );
  });

  it("stops the refresh interval on unmount", async () => {
    vi.useFakeTimers();
    mockOverview({ data: overviewFixture() });

    const wrapper = mountPage();
    await nextTick();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    wrapper.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("matches its rollup-grid snapshot with live data", () => {
    mockOverview({ data: overviewFixture() });

    // Scoped to .rollup-grid, not the whole page — the sync meta (whose
    // text depends on wall-clock time via the mount-timing test above)
    // renders in a sibling SectionLabel outside this element entirely.
    expect(mountPage().find(".rollup-grid").html()).toMatchSnapshot();
  });
});

describe("index.vue property grid", () => {
  beforeEach(() => {
    mockOverview({});
  });

  function buildCard(slug: string, mrrValue: number) {
    return {
      slug,
      status: { label: "LIVE", tone: "ok" as const },
      metrics: [
        {
          metric: "mrr",
          period: "current",
          value: mrrValue,
          capturedAt: "2026-09-19T00:00:00.000Z",
        },
      ],
      sparklines: [],
      integrations: [],
    };
  }

  it("renders every configured property as a skeleton card while useApps is pending", () => {
    mockApps({ pending: true });

    const wrapper = mountPage();

    const cards = wrapper.findAllComponents(PropertyCard);
    expect(cards).toHaveLength(6);
    expect(wrapper.findAllComponents(PropertyCardMetricsSkeleton)).toHaveLength(
      6,
    );
    cards.forEach((card) => {
      expect(card.props("isPending")).toBe(true);
    });
  });

  it("merges each fetched card into its matching property by slug, not by array position", () => {
    // APPS declares basin first and markpost second (app/config/apps.ts),
    // but the response below reverses that order — a merge that assumed
    // row order matched APPS' order (e.g. indexing appsData by position)
    // would hand basin's PropertyCard markpost's data and vice versa. Only
    // a slug-keyed merge gets both right.
    mockApps({ data: [buildCard("markpost", 591), buildCard("basin", 412)] });

    const wrapper = mountPage();
    const propertyCardsBySlug = new Map(
      wrapper
        .findAllComponents(PropertyCard)
        .map((card) => [card.props("app").slug, card]),
    );

    expect(propertyCardsBySlug.get("basin")!.props("app").card).toEqual(
      buildCard("basin", 412),
    );
    expect(propertyCardsBySlug.get("markpost")!.props("app").card).toEqual(
      buildCard("markpost", 591),
    );
    // A slug the response didn't include at all merges in as null, not
    // whatever row happened to be left over positionally.
    expect(propertyCardsBySlug.get("wanderist")!.props("app").card).toBeNull();
  });

  it("passes the fetch error through to every card instead of blocking the whole grid", () => {
    mockApps({ error: new Error("network down") });

    const wrapper = mountPage();

    const cards = wrapper.findAllComponents(PropertyCard);
    expect(cards).toHaveLength(6);
    cards.forEach((card) => {
      expect(card.props("hasError")).toBe(true);
    });
    expect(wrapper.text()).toContain("Couldn't load live data.");
  });

  it("keeps showing a card's last successful data through a later failed refresh, rather than blanking it out", async () => {
    // Mirrors useFetch's real refresh lifecycle: `data` resets to null and
    // `pending` flips true when a refresh starts, then `error` sets once it
    // fails — Nuxt does not preserve the previous `data` across a refresh
    // (see this file's lastGoodAppsData comment in index.vue), so this test
    // fails if index.vue merges straight from `appsData` instead of that
    // cached copy.
    const { data, pending, error } = mockAppsLive({
      data: [buildCard("basin", 412)],
    });
    const wrapper = mountPage();
    await nextTick();

    data.value = null;
    pending.value = true;
    await nextTick();
    pending.value = false;
    error.value = new Error("network down");
    await nextTick();

    const basinPropertyCard = wrapper
      .findAllComponents(PropertyCard)
      .find((card) => card.props("app").slug === "basin")!;
    expect(basinPropertyCard.props("app").card).toEqual(
      buildCard("basin", 412),
    );
    expect(basinPropertyCard.props("hasError")).toBe(true);
  });

  it("doesn't flash a resolved card back into its loading skeleton when a later refresh starts", async () => {
    const { pending } = mockAppsLive({ data: [], pending: false });
    const wrapper = mountPage();
    await nextTick();

    const markpostCard = () =>
      wrapper
        .findAllComponents(PropertyCard)
        .find((card) => card.props("app").slug === "markpost")!;
    // Resolved already (to "no data synced yet" — an empty AppsResponse),
    // not pending.
    expect(markpostCard().props("isPending")).toBe(false);

    // A later refresh puts `pending` back to true — the grid already
    // resolved once, so cards should NOT skeleton-load again.
    pending.value = true;
    await nextTick();

    expect(markpostCard().props("isPending")).toBe(false);
  });
});
