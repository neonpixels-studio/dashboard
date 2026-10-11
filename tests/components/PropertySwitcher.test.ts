import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import PropertySwitcher from "../../app/components/PropertySwitcher.vue";

const NuxtLink = {
  props: ["to"],
  template: "<a :href='JSON.stringify(to)'><slot /></a>",
};

let wrapper: VueWrapper;

function mountSwitcher() {
  wrapper = mount(PropertySwitcher, {
    props: { currentSlug: "markpost", currentName: "markpost.io" },
    attachTo: document.body,
    global: { stubs: { NuxtLink } },
  });
  return wrapper;
}

beforeEach(() => {
  vi.stubGlobal("useRoute", () => ({
    query: { range: "7" },
    hash: "#traffic",
  }));
});

afterEach(() => {
  wrapper.unmount();
  vi.unstubAllGlobals();
});

describe("PropertySwitcher", () => {
  it("starts closed with an accessible trigger", () => {
    const trigger = mountSwitcher().find("button");
    expect(trigger.attributes("aria-haspopup")).toBe("menu");
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find("ul").exists()).toBe(false);
  });

  it("opens on click, listing properties plus the All properties link", async () => {
    mountSwitcher();
    await wrapper.find("button").trigger("click");
    expect(wrapper.find("button").attributes("aria-expanded")).toBe("true");
    const links = wrapper.findAll("[role=menuitem]");
    expect(links).toHaveLength(7);
    expect(links.at(-1)!.text()).toContain("All properties");
    expect(links.at(-1)!.attributes("href")).toBe('"/"');
  });

  it("checks only the current property and keeps query and hash in links", async () => {
    mountSwitcher();
    await wrapper.find("button").trigger("click");
    const current = wrapper.findAll("[aria-current=page]");
    expect(current).toHaveLength(1);
    expect(current[0]!.text()).toContain("markpost.io");
    expect(current[0]!.find("svg").exists()).toBe(true);
    expect(wrapper.findAll("[role=menuitem]")[0]!.attributes("href")).toBe(
      JSON.stringify({
        path: "/apps/basin",
        query: { range: "7" },
        hash: "#traffic",
      }),
    );
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    mountSwitcher();
    await wrapper.find("button").trigger("click");
    await wrapper.find("ul").trigger("keydown", { key: "Escape" });
    expect(wrapper.find("ul").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find("button").element);
  });

  it("closes on an outside pointerdown but not an inside one", async () => {
    mountSwitcher();
    await wrapper.find("button").trigger("click");
    await wrapper.find("ul").trigger("pointerdown");
    expect(wrapper.find("ul").exists()).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find("ul").exists()).toBe(false);
  });

  it("closes after a selection", async () => {
    mountSwitcher();
    await wrapper.find("button").trigger("click");
    await wrapper.findAll("[role=menuitem]")[0]!.trigger("click");
    expect(wrapper.find("ul").exists()).toBe(false);
  });

  it("opens with ArrowDown focusing the first item, then arrows move and wrap", async () => {
    mountSwitcher();
    await wrapper.find("button").trigger("keydown", { key: "ArrowDown" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    const links = wrapper
      .findAll("[role=menuitem]")
      .map((link) => link.element);
    expect(document.activeElement).toBe(links[0]);
    await wrapper.find("ul").trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(links[1]);
    await wrapper.find("ul").trigger("keydown", { key: "ArrowUp" });
    await wrapper.find("ul").trigger("keydown", { key: "ArrowUp" });
    expect(document.activeElement).toBe(links.at(-1));
  });

  it("matches its snapshot closed", () => {
    expect(mountSwitcher().html()).toMatchSnapshot();
  });

  it("matches its snapshot open", async () => {
    mountSwitcher();
    await wrapper.find("button").trigger("click");
    expect(wrapper.html()).toMatchSnapshot();
  });
});
