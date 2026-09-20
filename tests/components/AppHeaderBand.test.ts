import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AppHeaderBand from "../../app/components/AppHeaderBand.vue";
import SkeletonBlock from "../../app/components/SkeletonBlock.vue";
import { findAppBySlug } from "../../app/config/apps";
import type { AppStatus } from "../../shared/types/dashboard";

const app = findAppBySlug("basin")!;

function mountBand(status: AppStatus | null = null) {
  return mount(AppHeaderBand, {
    props: { app, status },
    global: { components: { SkeletonBlock } },
  });
}

describe("AppHeaderBand", () => {
  it("renders a skeleton status chip when no status has loaded yet", () => {
    const wrapper = mountBand(null);
    expect(wrapper.findComponent(SkeletonBlock).exists()).toBe(true);
    expect(wrapper.find(".status-chip").exists()).toBe(false);
  });

  it("renders the real status label once available", () => {
    const wrapper = mountBand({ label: "LIVE", tone: "ok" });
    expect(wrapper.find(".status-chip").text()).toBe("LIVE");
    expect(wrapper.findComponent(SkeletonBlock).exists()).toBe(false);
  });

  it("still renders identity fields (name, tagline, open link) unchanged", () => {
    const wrapper = mountBand(null);
    expect(wrapper.text()).toContain(app.tagline);
    expect(wrapper.find("a.open-btn").attributes("href")).toBe(app.url);
  });

  it("matches its snapshot while status is loading", () => {
    expect(mountBand(null).html()).toMatchSnapshot();
  });

  it("matches its snapshot once status has loaded", () => {
    expect(mountBand({ label: "LIVE", tone: "ok" }).html()).toMatchSnapshot();
  });
});
