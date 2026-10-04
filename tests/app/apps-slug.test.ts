import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import AppDetailPage from "../../app/pages/apps/[slug].vue";
import AppHeaderBand from "../../app/components/AppHeaderBand.vue";
import { UNAVAILABLE_STATUS } from "../../app/utils/headerStatus";
import { appDetailFixture } from "../support/appDetailFixture";
import type { AppDetailResponse } from "../../shared/types/dashboard";

const mockUseApp = vi.fn();
vi.mock("../../app/composables/useApp", () => ({
  useApp: () => mockUseApp(),
}));

function mountPage(
  detail: AppDetailResponse | null,
  pending = false,
  error: Error | null = null,
) {
  mockUseApp.mockReturnValue({
    data: ref(detail),
    pending: ref(pending),
    error: ref(error),
    refresh: vi.fn(),
  });
  return mount(AppDetailPage, {
    global: {
      components: { AppHeaderBand, ControlTopBar: { template: "<div />" } },
    },
  });
}

describe("apps/[slug] page", () => {
  beforeEach(() => {
    vi.stubGlobal("useRoute", () => ({ params: { slug: "basin" } }));
    vi.stubGlobal("useHead", vi.fn());
    vi.stubGlobal("createError", (input: object) => input);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes the detail response's status to the header band", () => {
    const status = { label: "2 ISSUES", tone: "danger" } as const;
    const wrapper = mountPage(appDetailFixture({ status }));

    expect(wrapper.findComponent(AppHeaderBand).props("status")).toEqual(
      status,
    );
  });

  it("passes a null status to the header band before the detail loads", () => {
    const wrapper = mountPage(null, true);

    expect(wrapper.findComponent(AppHeaderBand).props("status")).toBeNull();
  });

  it("passes UNAVAILABLE to the header band when the detail fetch fails", () => {
    const wrapper = mountPage(null, false, new Error("boom"));

    expect(wrapper.findComponent(AppHeaderBand).props("status")).toBe(
      UNAVAILABLE_STATUS,
    );
    expect(wrapper.find(".header-band").attributes("aria-busy")).toBe("false");
  });
});
