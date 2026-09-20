import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import DataErrorState from "../../app/components/DataErrorState.vue";
import AppIcon from "../../app/components/AppIcon.vue";

function mountState(props: Record<string, unknown> = {}) {
  return mount(DataErrorState, {
    props,
    global: { components: { AppIcon } },
  });
}

describe("DataErrorState", () => {
  it("shows a default message when none is given", () => {
    expect(mountState().text()).toContain("Couldn't load live data.");
  });

  it("shows a custom message when given one", () => {
    const wrapper = mountState({ message: "Sync failed for basin.fm." });
    expect(wrapper.text()).toContain("Sync failed for basin.fm.");
  });

  it("shows never synced when lastSyncedAt is null", () => {
    expect(mountState().text()).toContain("never synced");
  });

  it("shows a relative sync note when lastSyncedAt is given", () => {
    const wrapper = mountState({
      lastSyncedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    });
    expect(wrapper.text()).toMatch(/synced \d+m ago/);
  });

  it("exposes role=alert for assistive tech", () => {
    expect(mountState().attributes("role")).toBe("alert");
  });

  it("matches its snapshot", () => {
    // lastSyncedAt intentionally omitted (stays null) — the "Xm/Xh/Xd ago"
    // text otherwise depends on wall-clock time and would make this
    // snapshot flake between runs.
    expect(
      mountState({ message: "Sync failed for basin.fm." }).html(),
    ).toMatchSnapshot();
  });
});
