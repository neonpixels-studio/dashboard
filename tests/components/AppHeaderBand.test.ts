import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AppHeaderBand from "../../app/components/AppHeaderBand.vue";
import SkeletonBlock from "../../app/components/SkeletonBlock.vue";
import { APPS, findAppBySlug } from "../../app/config/apps";
import { buildHeaderLinks } from "../../app/utils/headerLinks";
import { UNAVAILABLE_STATUS } from "../../app/utils/headerStatus";
import type { AppStatus } from "../../shared/types/dashboard";

const app = findAppBySlug("basin")!;

function mountBand(status: AppStatus | null = null, targetApp = app) {
  return mount(AppHeaderBand, {
    props: {
      app: targetApp,
      status,
      secondaryLinks: buildHeaderLinks(targetApp),
    },
    global: { components: { SkeletonBlock } },
  });
}

describe("AppHeaderBand", () => {
  it("renders a skeleton status chip when no status has loaded yet", () => {
    const wrapper = mountBand(null);
    expect(wrapper.findComponent(SkeletonBlock).exists()).toBe(true);
    expect(wrapper.find(".status-chip").exists()).toBe(false);
  });

  it("places the status chip in the title row, right after the heading", () => {
    const row = mountBand({ label: "LIVE", tone: "ok" }).find(".title-row");
    expect(row.element.children[0]!.tagName).toBe("H1");
    expect(row.element.children[1]!.classList.contains("status-chip")).toBe(
      true,
    );
  });

  it("renders the real status label once available", () => {
    const wrapper = mountBand({ label: "LIVE", tone: "ok" });
    expect(wrapper.find(".status-chip").text()).toBe("LIVE");
    expect(wrapper.findComponent(SkeletonBlock).exists()).toBe(false);
  });

  it.each([
    [{ label: "3 ISSUES", tone: "danger" }],
    [{ label: "NOT SYNCED", tone: "muted" }],
  ] as [AppStatus][])(
    "renders the %j status instead of the skeleton",
    (status) => {
      const wrapper = mountBand(status);
      expect(wrapper.find(".status-chip").text()).toBe(status.label);
      expect(wrapper.attributes("aria-busy")).toBe("false");
      expect(wrapper.findComponent(SkeletonBlock).exists()).toBe(false);
    },
  );

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

  it("matches its snapshot in the error state", () => {
    const wrapper = mountBand(UNAVAILABLE_STATUS);
    expect(wrapper.attributes("aria-busy")).toBe("false");
    expect(wrapper.find(".status-chip").text()).toBe("UNAVAILABLE");
    expect(wrapper.html()).toMatchSnapshot();
  });

  it.each([
    ["product", 2],
    ["writing", 3],
    ["marketing", 2],
  ] as const)(
    "renders new-tab links with real hrefs for the %s template",
    (template, linkCount) => {
      const templateApp = APPS.find(
        (candidate) => candidate.template === template,
      );
      expect(templateApp).toBeDefined();
      const wrapper = mountBand(null, templateApp!);
      const links = wrapper.findAll("a.secondary-btn");
      expect(links).toHaveLength(linkCount);
      for (const link of links) {
        expect(link.attributes("href")).toMatch(/^https:\/\//);
        expect(link.attributes("target")).toBe("_blank");
        expect(link.attributes("rel")).toBe("noopener");
      }
      expect(wrapper.html()).toMatchSnapshot();
    },
  );
});
