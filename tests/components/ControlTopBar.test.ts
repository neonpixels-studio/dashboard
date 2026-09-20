import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ControlTopBar from "../../app/components/ControlTopBar.vue";
import BrandMark from "../../app/components/BrandMark.vue";

// ControlTopBar relies on Nuxt's <NuxtLink>, its own auto-imported
// <BrandMark>, and @clerk/nuxt's <UserButton> — none registered outside a
// running Nuxt app. Register BrandMark for real (it's a component under
// test elsewhere in this suite) and stub the two Nuxt/Clerk-provided ones,
// the same way PropertyCard.test.ts stubs NuxtLink.
function mountBar(props: Record<string, unknown> = {}) {
  return mount(ControlTopBar, {
    props,
    global: {
      components: { BrandMark },
      stubs: {
        NuxtLink: { props: ["to"], template: "<a :href='to'><slot /></a>" },
        UserButton: { template: "<div class='user-button-stub' />" },
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

  it("links the brand mark back to the overview", () => {
    expect(mountBar().find("a.brand").attributes("href")).toBe("/");
  });

  it("renders the user button", () => {
    expect(mountBar().find(".user-button-stub").exists()).toBe(true);
  });

  it("matches its snapshot without a crumb", () => {
    expect(mountBar().html()).toMatchSnapshot();
  });

  it("matches its snapshot with a crumb", () => {
    expect(mountBar({ crumb: "basin.fm" }).html()).toMatchSnapshot();
  });
});
