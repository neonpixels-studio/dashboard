import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import DeployTile from "../../app/components/DeployTile.vue";
import AppIcon from "../../app/components/AppIcon.vue";
import type { AppDeploy } from "../../shared/types/dashboard";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T14:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function mountTile(deploy: AppDeploy) {
  return mount(DeployTile, {
    props: { deploy, appUrl: "https://basin.fm" },
    global: { components: { AppIcon } },
  });
}

const SUCCESS: AppDeploy = {
  status: "success",
  deployId: "d1",
  finishedAt: "2026-10-10T12:00:00.000Z",
};
const FAILED: AppDeploy = { ...SUCCESS, status: "failed" };
const IN_PROGRESS: AppDeploy = {
  status: "in_progress",
  deployId: "d3",
  finishedAt: null,
};
const NONE: AppDeploy = { status: "none", deployId: null, finishedAt: null };
const NOT_CONFIGURED: AppDeploy = {
  status: "not_configured",
  deployId: null,
  finishedAt: null,
};

describe("DeployTile", () => {
  it.each([
    ["success", SUCCESS],
    ["failed", FAILED],
    ["in progress", IN_PROGRESS],
    ["none yet", NONE],
    ["not configured", NOT_CONFIGURED],
  ])("renders the %s state", (_name, deploy) => {
    expect(mountTile(deploy).html()).toMatchSnapshot();
  });

  it("links to the deploy in Netlify in a new tab", () => {
    const link = mountTile(SUCCESS);
    expect(link.element.tagName).toBe("A");
    expect(link.attributes()).toMatchObject({
      href: "https://app.netlify.com/projects/basin-fm/deploys/d1",
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("shows the full timestamp on hover of the relative time", () => {
    const time = mountTile(SUCCESS).find("time");
    expect(time.text()).toBe("2h ago");
    expect(time.attributes("title")).toBe("10 OCT 2026 · 12:00 UTC");
    expect(time.attributes("datetime")).toBe("2026-10-10T12:00:00.000Z");
  });

  it("is not a link and has no time element when not configured", () => {
    const wrapper = mountTile(NOT_CONFIGURED);
    expect(wrapper.element.tagName).toBe("DIV");
    expect(wrapper.attributes("href")).toBeUndefined();
    expect(wrapper.find("time").exists()).toBe(false);
    expect(wrapper.text()).toContain("NOT CONFIGURED");
  });

  it("tints a failed deploy as danger", () => {
    expect(mountTile(FAILED).classes()).toContain("danger");
  });
});
