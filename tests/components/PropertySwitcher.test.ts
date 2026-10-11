import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { APPS } from "../../app/config/apps";
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

function menuItemElements() {
  return wrapper.findAll("[role=menuitem]").map((link) => link.element);
}

async function openByClick() {
  await wrapper.find("button").trigger("click");
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
    await openByClick();
    expect(wrapper.find("button").attributes("aria-expanded")).toBe("true");
    const links = wrapper.findAll("[role=menuitem]");
    expect(links).toHaveLength(APPS.length + 1);
    expect(links.at(-1)!.text()).toContain("All properties");
    expect(links.at(-1)!.attributes("href")).toBe('"/"');
  });

  it("checks only the current property and keeps query and hash in links", async () => {
    mountSwitcher();
    await openByClick();
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
    await openByClick();
    await wrapper.find("ul").trigger("keydown", { key: "Escape" });
    expect(wrapper.find("ul").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find("button").element);
  });

  it("closes on an outside pointerdown but not an inside one", async () => {
    mountSwitcher();
    await openByClick();
    await wrapper.find("ul").trigger("pointerdown");
    expect(wrapper.find("ul").exists()).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find("ul").exists()).toBe(false);
  });

  it("closes after a selection", async () => {
    mountSwitcher();
    await openByClick();
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

  it("closes on Escape pressed on the trigger after a click open", async () => {
    mountSwitcher();
    await openByClick();
    await wrapper.find("button").trigger("keydown", { key: "Escape" });
    expect(wrapper.find("ul").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find("button").element);
  });

  it("opens with ArrowUp focusing the last item", async () => {
    mountSwitcher();
    await wrapper.find("button").trigger("keydown", { key: "ArrowUp" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    const links = wrapper
      .findAll("[role=menuitem]")
      .map((link) => link.element);
    expect(document.activeElement).toBe(links.at(-1));
  });

  it("jumps with Home and End", async () => {
    mountSwitcher();
    await openByClick();
    const links = wrapper
      .findAll("[role=menuitem]")
      .map((link) => link.element);
    await wrapper.find("ul").trigger("keydown", { key: "End" });
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(links.at(-1));
    await wrapper.find("ul").trigger("keydown", { key: "Home" });
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(links[0]);
  });

  it("opens by click with focus on the first item", async () => {
    mountSwitcher();
    await openByClick();
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(menuItemElements()[0]);
  });

  it("closes when focus moves outside, without stealing it back", async () => {
    mountSwitcher();
    await openByClick();
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    await wrapper.find("ul").trigger("focusout", { relatedTarget: outside });
    expect(wrapper.find("ul").exists()).toBe(false);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("stays open when focus moves between items", async () => {
    mountSwitcher();
    await openByClick();
    await wrapper
      .find("ul")
      .trigger("focusout", { relatedTarget: menuItemElements()[1] });
    expect(wrapper.find("ul").exists()).toBe(true);
  });

  it("wraps from the last item to the first with ArrowDown", async () => {
    mountSwitcher();
    await openByClick();
    const links = wrapper
      .findAll("[role=menuitem]")
      .map((link) => link.element);
    await wrapper.find("ul").trigger("keydown", { key: "End" });
    await wrapper.vm.$nextTick();
    await wrapper.find("ul").trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(links[0]);
  });

  it("does not swallow Escape while the menu is closed", async () => {
    mountSwitcher();
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
      bubbles: true,
    });
    wrapper.find("button").element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("matches its snapshot closed", () => {
    expect(mountSwitcher().html()).toMatchSnapshot();
  });

  it("matches its snapshot open", async () => {
    mountSwitcher();
    await openByClick();
    expect(wrapper.html()).toMatchSnapshot();
  });
});
