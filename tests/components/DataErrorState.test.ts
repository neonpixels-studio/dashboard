import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
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

  it("says no data has synced yet when lastSyncedAt is null, not a contradictory 'synced never synced'", () => {
    const text = mountState().text();
    expect(text).toContain("No data has synced yet.");
    expect(text).not.toContain("synced never synced");
  });

  it("renders a mount-independent sync note before the relative time fills in, to avoid an SSR/client hydration mismatch", () => {
    const wrapper = mountState({
      lastSyncedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    });
    // Read synchronously, before the post-mount reactive update has been
    // flushed to the DOM — this is what SSR + the client's first paint show.
    expect(wrapper.text()).toContain("Showing the last known state.");
    expect(wrapper.text()).not.toMatch(/synced \d+m ago/);
  });

  it("fills in the relative sync note once mounted", async () => {
    const wrapper = mountState({
      lastSyncedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    });
    await nextTick();
    expect(wrapper.text()).toMatch(/synced \d+m ago/);
  });

  it("updates the sync note when lastSyncedAt changes after a retry, without remounting", async () => {
    const wrapper = mountState({ lastSyncedAt: null });
    await nextTick();
    expect(wrapper.text()).toContain("No data has synced yet.");

    await wrapper.setProps({
      lastSyncedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await nextTick();

    expect(wrapper.text()).toMatch(/synced \d+m ago/);
  });

  it("emits retry when the retry button is clicked", async () => {
    const wrapper = mountState();
    await wrapper.find(".retry-btn").trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);
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
