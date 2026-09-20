import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AppDetailResponse } from "../../shared/types/dashboard";

vi.stubGlobal("useFetch", vi.fn());
const { useApp } = await import("../../app/composables/useApp");

const DETAIL_RESPONSE: AppDetailResponse = {
  slug: "basin",
  metrics: [],
  series: [],
  trafficBreakdown: [],
  syndication: [],
  alerts: [],
  sources: [],
  lastSyncedAt: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useApp", () => {
  it("builds the URL and key from a plain string slug", () => {
    const mockUseFetch = vi.fn(() => ({
      data: ref(DETAIL_RESPONSE),
      pending: ref(false),
      error: ref(null),
      refresh: vi.fn(),
    }));
    vi.stubGlobal("useFetch", mockUseFetch);

    useApp("basin");

    const [urlGetter, options] = mockUseFetch.mock.calls[0] as [
      () => string,
      { key: () => string },
    ];
    expect(urlGetter()).toBe("/api/apps/basin");
    expect(options.key()).toBe("app-detail-basin");
  });

  it("re-derives the URL and key from a ref slug reactively", () => {
    const slug = ref("basin");
    const mockUseFetch = vi.fn(() => ({
      data: ref(DETAIL_RESPONSE),
      pending: ref(false),
      error: ref(null),
      refresh: vi.fn(),
    }));
    vi.stubGlobal("useFetch", mockUseFetch);

    useApp(slug);
    const [urlGetter, options] = mockUseFetch.mock.calls[0] as [
      () => string,
      { key: () => string },
    ];
    expect(urlGetter()).toBe("/api/apps/basin");

    slug.value = "markpost";
    expect(urlGetter()).toBe("/api/apps/markpost");
    expect(options.key()).toBe("app-detail-markpost");
  });

  it("URL-encodes a slug so it can't change the request path or inject a query string", () => {
    const mockUseFetch = vi.fn(() => ({
      data: ref(DETAIL_RESPONSE),
      pending: ref(false),
      error: ref(null),
      refresh: vi.fn(),
    }));
    vi.stubGlobal("useFetch", mockUseFetch);

    useApp("a/b?c=d");

    const [urlGetter, options] = mockUseFetch.mock.calls[0] as [
      () => string,
      { key: () => string },
    ];
    expect(urlGetter()).toBe("/api/apps/a%2Fb%3Fc%3Dd");
    expect(options.key()).toBe("app-detail-a%2Fb%3Fc%3Dd");
  });

  it("returns typed data, pending, error, and refresh", () => {
    const refresh = vi.fn();
    vi.stubGlobal("useFetch", () => ({
      data: ref(DETAIL_RESPONSE),
      pending: ref(false),
      error: ref(null),
      refresh,
    }));

    const detail = useApp("basin");

    expect(detail.data.value).toEqual(DETAIL_RESPONSE);
    expect(detail.pending.value).toBe(false);
    expect(detail.error.value).toBeNull();
    expect(detail.refresh).toBe(refresh);
  });
});
