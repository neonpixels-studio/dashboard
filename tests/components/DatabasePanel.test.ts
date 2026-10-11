import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import DatabasePanel from "../../app/components/DatabasePanel.vue";
import DatabasePanelBody from "../../app/components/DatabasePanelBody.vue";
import AppIcon from "../../app/components/AppIcon.vue";
import BarMeter from "../../app/components/BarMeter.vue";
import SkeletonBlock from "../../app/components/SkeletonBlock.vue";
import DataErrorState from "../../app/components/DataErrorState.vue";
import { databasePanelFixture } from "../support/databasePanelFixture";

const ALERTS = [
  {
    id: "compute",
    message: "Projected 81 of 100 CU-hours (81% of the free-plan allowance)",
  },
  { id: "branches", message: "Unexpected branch: agent-neon-usage-panel" },
];

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(DatabasePanel, {
    props: {
      panel: databasePanelFixture(),
      pending: false,
      hasError: false,
      ...props,
    },
    global: {
      components: {
        AppIcon,
        BarMeter,
        DatabasePanelBody,
        SkeletonBlock,
        DataErrorState,
      },
    },
  });
}

describe("DatabasePanel", () => {
  it("is the #database overview anchor", () => {
    expect(mountPanel().attributes("id")).toBe("database");
  });

  it("shows compute used, allowance and projection, storage, transfer and branches", () => {
    const text = mountPanel().text();

    expect(text).toContain("24.0 CU-hours of 100.0 CU-hours");
    expect(text).toContain("61.5 CU-hours (62%)");
    expect(text).toContain("31 MB of 1.00 GB");
    expect(text).toContain("9 MB");
    expect(
      mountPanel()
        .findAll(".branch-row")
        .map((row) => row.find(".branch-name").text()),
    ).toEqual(["development", "production"]);
  });

  it("lists branch creation dates as machine-readable times", () => {
    const time = mountPanel().find(".branch-date");

    expect(time.attributes("datetime")).toBe("2026-08-01T00:00:00.000Z");
    expect(time.text()).toBe("01 AUG 2026");
  });

  it("shows no alert list or count when there are no alerts", () => {
    const wrapper = mountPanel();

    expect(wrapper.find(".database-alerts").exists()).toBe(false);
    expect(wrapper.find(".panel-count").exists()).toBe(false);
  });

  it("lists each alert and counts them", () => {
    const wrapper = mountPanel({
      panel: databasePanelFixture({ alerts: ALERTS }),
    });

    expect(wrapper.findAll(".database-alert")).toHaveLength(2);
    expect(wrapper.find(".database-alert").text()).toContain("Projected 81");
    expect(wrapper.find(".panel-count").text()).toBe("2");
  });

  it("fills the compute bar red when the projection is past the threshold", () => {
    const wrapper = mountPanel({
      panel: databasePanelFixture({
        compute: {
          usedCuHours: 26,
          allowanceCuHours: 100,
          projectedCuHours: 81,
          periodEnded: false,
        },
      }),
    });

    expect(wrapper.findAll(".fill")[0]!.attributes("style")).toContain(
      "width: 26%",
    );
    expect(wrapper.findAll(".fill")[0]!.attributes("style")).toContain(
      "var(--err)",
    );
  });

  it("shows the empty state when nothing has synced, never zeros", () => {
    const wrapper = mountPanel({ panel: null });

    expect(wrapper.find(".database-empty").text()).toBe(
      "No Neon usage synced yet.",
    );
    expect(wrapper.findComponent(BarMeter).exists()).toBe(false);
  });

  it("shows a skeleton while the first load is pending", () => {
    const wrapper = mountPanel({ panel: null, pending: true });

    expect(wrapper.findComponent(SkeletonBlock).exists()).toBe(true);
    expect(wrapper.find(".database-empty").exists()).toBe(false);
  });

  it("keeps showing loaded data during a refresh", () => {
    const wrapper = mountPanel({ pending: true });

    expect(wrapper.findComponent(SkeletonBlock).exists()).toBe(false);
    expect(wrapper.findComponent(BarMeter).exists()).toBe(true);
  });

  it("shows an error state and emits retry, with no stale alert count", async () => {
    const wrapper = mountPanel({
      panel: databasePanelFixture({ alerts: ALERTS }),
      hasError: true,
    });

    expect(wrapper.find(".panel-count").exists()).toBe(false);
    expect(wrapper.findComponent(BarMeter).exists()).toBe(false);
    await wrapper.find(".retry-btn").trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);
  });

  it("matches its snapshot without alerts", () => {
    expect(mountPanel().html()).toMatchSnapshot();
  });

  it("matches its snapshot with alerts", () => {
    expect(
      mountPanel({
        panel: databasePanelFixture({
          compute: {
            usedCuHours: 26,
            allowanceCuHours: 100,
            projectedCuHours: 81,
            periodEnded: false,
          },
          alerts: ALERTS,
        }),
      }).html(),
    ).toMatchSnapshot();
  });
});
