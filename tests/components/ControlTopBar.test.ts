import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ControlTopBar from "../../app/components/ControlTopBar.vue";
import BrandMark from "../../app/components/BrandMark.vue";
import OverviewRangeSelector from "../../app/components/OverviewRangeSelector.vue";

// ControlTopBar relies on Nuxt's <NuxtLink>, its own auto-imported
// <BrandMark>, and @clerk/nuxt's <UserButton> — none registered outside a
// running Nuxt app. Register BrandMark for real (it's a component under
// test elsewhere in this suite) and stub the two Nuxt/Clerk-provided ones,
// the same way PropertyCard.test.ts stubs NuxtLink.
function mountBar(props: Record<string, unknown> = {}) {
  return mount(ControlTopBar, {
    props,
    global: {
      components: { BrandMark, OverviewRangeSelector },
      stubs: {
        NuxtLink: { props: ["to"], template: "<a :href='to'><slot /></a>" },
        UserButton: {
          name: "UserButton",
          props: ["signOutRedirectUrl", "appearance"],
          template: "<div class='user-button-stub' />",
        },
      },
    },
  });
}

describe("ControlTopBar", () => {
  it("renders the studio nav and hides the breadcrumb when no crumb is given", () => {
    const wrapper = mountBar();
    expect(wrapper.find(".top-nav").exists()).toBe(true);
    expect(wrapper.find(".crumb-current").exists()).toBe(false);
    expect(wrapper.find(".brand-sub").text()).toBe("CONTROL");
  });

  it("renders the breadcrumb and hides the studio nav when a crumb is given", () => {
    const wrapper = mountBar({ crumb: "basin.fm" });
    expect(wrapper.find(".top-nav").exists()).toBe(false);
    expect(wrapper.find(".crumb-current").text()).toBe("basin.fm");
    expect(wrapper.find(".brand-sub").exists()).toBe(false);
  });

  it("links Alerts to the #alerts panel and has no Integrations item", () => {
    const wrapper = mountBar();
    const hrefs = wrapper.findAll(".nav-link").map((link) => ({
      text: link.text(),
      href: link.attributes("href"),
    }));
    expect(hrefs).toContainEqual({ text: "Alerts", href: "#alerts" });
    expect(hrefs.map((link) => link.text)).not.toContain("Integrations");
  });

  it("links the brand mark back to the overview", () => {
    expect(mountBar().find("a.brand").attributes("href")).toBe("/");
  });

  it("renders the user button, wired to redirect to /login on sign-out", () => {
    const userButton = mountBar().findComponent({ name: "UserButton" });
    expect(userButton.exists()).toBe(true);
    expect(userButton.props("signOutRedirectUrl")).toBe("/login");
    expect(userButton.props("appearance")).toEqual({
      elements: { avatarBox: { width: "32px", height: "32px" } },
    });
  });

  it("hides the range selector when no range is given (detail pages)", () => {
    expect(mountBar().find(".range-selector").exists()).toBe(false);
    expect(
      mountBar({ crumb: "basin.fm" }).find(".range-selector").exists(),
    ).toBe(false);
  });

  it("shows the range selector with the given range pressed", () => {
    const wrapper = mountBar({ range: 7 });
    const pressed = wrapper
      .findAll(".range-option")
      .filter((option) => option.attributes("aria-pressed") === "true");
    expect(pressed.map((option) => option.text())).toEqual([
      "7D (last 7 days)",
    ]);
  });

  it("re-emits a selected range as update:range", async () => {
    const wrapper = mountBar({ range: 30 });
    await wrapper.findAll(".range-option")[2]!.trigger("click");
    expect(wrapper.emitted("update:range")).toEqual([[60]]);
  });

  it("matches its snapshot with a range selector", () => {
    expect(mountBar({ range: 30 }).html()).toMatchSnapshot();
  });

  it("matches its snapshot without a crumb", () => {
    expect(mountBar().html()).toMatchSnapshot();
  });

  it("matches its snapshot with a crumb", () => {
    expect(mountBar({ crumb: "basin.fm" }).html()).toMatchSnapshot();
  });
});
