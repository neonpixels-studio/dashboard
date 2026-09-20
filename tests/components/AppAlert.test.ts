import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AppAlert from "../../app/components/AppAlert.vue";
import AppIcon from "../../app/components/AppIcon.vue";

function mountAlert(
  props: Record<string, unknown> = {},
  slotText = "API 502 · retry queued",
) {
  return mount(AppAlert, {
    props,
    slots: { default: slotText },
    global: { components: { AppIcon } },
  });
}

describe("AppAlert", () => {
  it("defaults to the info tone with an Info title", () => {
    const wrapper = mountAlert();
    expect(wrapper.classes()).toContain("info");
    expect(wrapper.find(".a-title").text()).toBe("Info");
  });

  it("renders the slot content as the alert body", () => {
    expect(mountAlert({}, "Sync failed for basin.fm.").text()).toContain(
      "Sync failed for basin.fm.",
    );
  });

  it("uses a custom title over the tone label when given", () => {
    const wrapper = mountAlert({ tone: "err", title: "Cross-post failed" });
    expect(wrapper.find(".a-title").text()).toBe("Cross-post failed");
  });

  it.each<["err" | "warn" | "ok" | "info", string, string]>([
    ["err", "Error", "triangle"],
    ["warn", "Warning", "triangle"],
    ["ok", "Success", "checkCircle"],
    ["info", "Info", "info"],
  ])(
    "labels the %s tone as %s by default and shows the %s icon",
    (tone, label, iconName) => {
      const wrapper = mountAlert({ tone });
      expect(wrapper.classes()).toContain(tone);
      expect(wrapper.find(".a-title").text()).toBe(label);
      expect(wrapper.findComponent(AppIcon).props("name")).toBe(iconName);
    },
  );

  it("exposes role=alert for assistive tech", () => {
    expect(mountAlert().attributes("role")).toBe("alert");
  });

  it("omits the close button by default", () => {
    expect(mountAlert().find(".a-close").exists()).toBe(false);
  });

  it("emits close when the close button is clicked", async () => {
    const wrapper = mountAlert({ closeable: true });
    await wrapper.find(".a-close").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("matches its snapshot", () => {
    expect(
      mountAlert(
        { tone: "warn", closeable: true },
        "API 502 · retry queued",
      ).html(),
    ).toMatchSnapshot();
  });
});
