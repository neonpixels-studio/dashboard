import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import DetailStateShell from "../../app/components/DetailStateShell.vue";
import DataErrorState from "../../app/components/DataErrorState.vue";
import AppAlert from "../../app/components/AppAlert.vue";
import AppIcon from "../../app/components/AppIcon.vue";

const GLOBAL_COMPONENTS = { DataErrorState, AppAlert, AppIcon };

function mountShell(
  props: Partial<{
    pending: boolean;
    error: unknown;
    lastSyncedAt: string | null;
    refresh: () => Promise<void>;
    alerts: {
      slug: string;
      vendor: string;
      message: string;
      occurredAt: string | null;
    }[];
    hasData: boolean;
  }> = {},
) {
  return mount(DetailStateShell, {
    props: {
      pending: false,
      error: null,
      lastSyncedAt: null,
      refresh: vi.fn(),
      ...props,
    },
    slots: {
      pending: "<div class='pending-slot'>loading</div>",
      default: "<div class='loaded-slot'>loaded</div>",
    },
    global: { components: GLOBAL_COMPONENTS },
  });
}

describe("DetailStateShell", () => {
  it("shows the pending slot while pending with no existing data", () => {
    const wrapper = mountShell({ pending: true, hasData: false });
    expect(wrapper.find(".pending-slot").exists()).toBe(true);
    expect(wrapper.find(".loaded-slot").exists()).toBe(false);
  });

  it("keeps showing loaded content during a background refresh, not a loading flash", () => {
    // pending + hasData both true: a refresh is in flight but real data is
    // already on screen — swapping back to the pending slot here would hide
    // valid content behind a loading flash for no reason.
    const wrapper = mountShell({ pending: true, hasData: true });
    expect(wrapper.find(".loaded-slot").exists()).toBe(true);
    expect(wrapper.find(".pending-slot").exists()).toBe(false);
  });

  it("shows the error state over the pending slot when both are true", () => {
    const wrapper = mountShell({
      pending: true,
      hasData: false,
      error: new Error("boom"),
    });
    expect(wrapper.findComponent(DataErrorState).exists()).toBe(true);
    expect(wrapper.find(".pending-slot").exists()).toBe(false);
    expect(wrapper.find(".loaded-slot").exists()).toBe(false);
  });

  it("shows the error state over already-loaded content too — a failed refresh still needs surfacing", () => {
    const wrapper = mountShell({ error: new Error("boom"), hasData: true });
    expect(wrapper.findComponent(DataErrorState).exists()).toBe(true);
    expect(wrapper.find(".loaded-slot").exists()).toBe(false);
  });

  it("wires the error state's retry to the refresh prop", async () => {
    const refresh = vi.fn();
    const wrapper = mountShell({ error: new Error("boom"), refresh });
    await wrapper
      .findComponent(DataErrorState)
      .find(".retry-btn")
      .trigger("click");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("renders no alerts list when there are none", () => {
    const wrapper = mountShell();
    expect(wrapper.findAllComponents(AppAlert)).toHaveLength(0);
  });

  it("renders one AppAlert per real alert, above the default slot content", () => {
    const wrapper = mountShell({
      alerts: [
        {
          slug: "basin",
          vendor: "sentry",
          message: "401 Unauthorized",
          occurredAt: null,
        },
        {
          slug: "basin",
          vendor: "ga4",
          message: "quota exceeded",
          occurredAt: null,
        },
      ],
    });
    const alerts = wrapper.findAllComponents(AppAlert);
    expect(alerts).toHaveLength(2);
    expect(alerts[0]!.props("tone")).toBe("err");
    expect(alerts[0]!.text()).toContain("401 Unauthorized");
    expect(alerts[1]!.text()).toContain("quota exceeded");
  });
});
