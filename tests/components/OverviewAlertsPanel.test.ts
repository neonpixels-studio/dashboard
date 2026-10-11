import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import OverviewAlertsPanel from "../../app/components/OverviewAlertsPanel.vue";
import AppIcon from "../../app/components/AppIcon.vue";
import OverviewAlertRow from "../../app/components/OverviewAlertRow.vue";
import SkeletonBlock from "../../app/components/SkeletonBlock.vue";
import DataErrorState from "../../app/components/DataErrorState.vue";
import type { OverviewAlert } from "../../shared/types/alerts";

const ALERTS: OverviewAlert[] = [
  {
    id: "sync-failed:basin:stripe",
    slug: "basin",
    source: "stripe",
    message: "stripe: 401 unauthorized",
    occurredAt: "2026-10-10T14:05:00.000Z",
    href: "/apps/basin",
  },
  {
    id: "sync-stale:markpost:ga4",
    slug: "markpost",
    source: "ga4",
    message: "No successful sync in 8h",
    occurredAt: null,
    href: "/apps/markpost",
  },
];

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(OverviewAlertsPanel, {
    props: { alerts: ALERTS, pending: false, hasError: false, ...props },
    global: {
      components: { AppIcon, SkeletonBlock, DataErrorState, OverviewAlertRow },
      stubs: {
        NuxtLink: { props: ["to"], template: "<a :href='to'><slot /></a>" },
      },
    },
  });
}

describe("OverviewAlertsPanel", () => {
  it("is the #alerts nav target", () => {
    expect(mountPanel().attributes("id")).toBe("alerts");
  });

  it("lists each alert with property, source, message, and a link to the property", () => {
    const rows = mountPanel().findAll(".alert-row");

    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain("basin.fm");
    expect(rows[0]!.text()).toContain("stripe");
    expect(rows[0]!.text()).toContain("stripe: 401 unauthorized");
    expect(rows[0]!.find("time").text()).toBe("10 OCT 2026 · 14:05 UTC");
    expect(rows[0]!.find("a").attributes("href")).toBe("/apps/basin");
    expect(rows[1]!.find("time").exists()).toBe(false);
  });

  it("renders a failing-CI alert for the owning property, linked to the commit's checks", () => {
    const checksHref =
      "https://github.com/neonpixels-studio/markpost-cli/commit/abc123/checks";
    const rows = mountPanel({
      alerts: [
        {
          id: "ci-failing:markpost:markpost-cli",
          slug: "markpost",
          source: "github",
          message: "CI failing on main (markpost-cli)",
          occurredAt: "2026-10-09T08:00:00.000Z",
          href: checksHref,
        },
      ],
    }).findAll(".alert-row");

    expect(rows).toHaveLength(1);
    expect(rows[0]!.text()).toContain("markpost.io");
    expect(rows[0]!.text()).toContain("github");
    expect(rows[0]!.text()).toContain("CI failing on main (markpost-cli)");
    expect(rows[0]!.find("a").attributes("href")).toBe(checksHref);
  });

  it("shows the compact all-clear state when there are no alerts", () => {
    const wrapper = mountPanel({ alerts: [] });

    expect(wrapper.find(".alerts-clear").text()).toContain("All clear");
    expect(wrapper.find(".alert-list").exists()).toBe(false);
  });

  it("shows a skeleton while pending, never all-clear", () => {
    const wrapper = mountPanel({ alerts: [], pending: true });

    expect(wrapper.findComponent(SkeletonBlock).exists()).toBe(true);
    expect(wrapper.find(".alerts-clear").exists()).toBe(false);
  });

  it("keeps showing loaded alerts during a refresh instead of flashing a skeleton", () => {
    const wrapper = mountPanel({ pending: true });

    expect(wrapper.findComponent(SkeletonBlock).exists()).toBe(false);
    expect(wrapper.findAll(".alert-row")).toHaveLength(2);
  });

  it("omits the time for an unparseable timestamp", () => {
    const wrapper = mountPanel({
      alerts: [{ ...ALERTS[0], occurredAt: "garbage" }],
    });

    expect(wrapper.find("time").exists()).toBe(false);
  });

  it("shows an error state on failure, never all-clear, and emits retry", async () => {
    const wrapper = mountPanel({ alerts: [], hasError: true });

    expect(wrapper.find(".alerts-clear").exists()).toBe(false);
    await wrapper.find(".retry-btn").trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);
  });

  it("shows the error state over previously loaded alerts, with no stale count", () => {
    const wrapper = mountPanel({ hasError: true });

    expect(wrapper.find(".alert-list").exists()).toBe(false);
    expect(wrapper.find(".panel-count").exists()).toBe(false);
    expect(wrapper.find(".retry-btn").exists()).toBe(true);
  });

  it("gives each link a distinguishing accessible name", () => {
    const links = mountPanel().findAll(".alert-link");

    expect(links[0]!.attributes("aria-label")).toBe(
      "View basin.fm stripe alert",
    );
  });

  it("matches its snapshot with alerts", () => {
    expect(mountPanel().html()).toMatchSnapshot();
  });

  it("matches its snapshot when all clear", () => {
    expect(mountPanel({ alerts: [] }).html()).toMatchSnapshot();
  });
});
