import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { DATA_REFRESH_INTERVAL_MS } from "../../app/composables/usePollingRefresh";
import type { AppDetailResponse } from "../../shared/types/dashboard";

vi.stubGlobal("useFetch", vi.fn());
const { useApp } = await import("../../app/composables/useApp");

const DETAIL_RESPONSE: AppDetailResponse = {
  slug: "basin",
  status: { label: "LIVE", tone: "ok" },
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

  it("disables the fetch for an empty slug instead of requesting the collection endpoint", () => {
    const mockUseFetch = vi.fn(() => ({
      data: ref(DETAIL_RESPONSE),
      pending: ref(false),
      error: ref(null),
      refresh: vi.fn(),
    }));
    vi.stubGlobal("useFetch", mockUseFetch);

    useApp("");

    const [, options] = mockUseFetch.mock.calls[0] as [
      () => string,
      { enabled: () => boolean },
    ];
    expect(options.enabled()).toBe(false);
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

describe("useApp last good data", () => {
  type FetchOptions = { default: () => AppDetailResponse | undefined };

  function mountWithData(slug: string | { value: string }) {
    const data = ref<AppDetailResponse | undefined>(undefined);
    const mockUseFetch = vi.fn(() => ({
      data,
      pending: ref(false),
      error: ref(null),
      refresh: vi.fn(),
    }));
    vi.stubGlobal("useFetch", mockUseFetch);
    const scope = effectScope();
    scope.run(() =>
      useApp(() => (typeof slug === "string" ? slug : slug.value)),
    );
    const options = (
      mockUseFetch.mock.calls[0] as unknown[]
    )[1] as FetchOptions;
    return { data, options, scope };
  }

  it("defaults to undefined before any successful response", () => {
    const { options, scope } = mountWithData("basin");
    expect(options.default()).toBeUndefined();
    scope.stop();
  });

  it("defaults to the last successful response so a failed refresh keeps it", async () => {
    const { data, options, scope } = mountWithData("basin");
    data.value = DETAIL_RESPONSE;
    await nextTick();

    expect(options.default()).toEqual(DETAIL_RESPONSE);
    scope.stop();
  });

  it("does not remember an undefined data reset", async () => {
    const { data, options, scope } = mountWithData("basin");
    data.value = DETAIL_RESPONSE;
    await nextTick();
    data.value = undefined;
    await nextTick();

    expect(options.default()).toEqual(DETAIL_RESPONSE);
    scope.stop();
  });

  it("keeps the response after a simulated Nuxt error reset", async () => {
    const { data, options, scope } = mountWithData("basin");
    data.value = DETAIL_RESPONSE;
    await nextTick();

    data.value = undefined;
    await nextTick();
    data.value = options.default();
    await nextTick();

    expect(data.value).toBe(DETAIL_RESPONSE);
    scope.stop();
  });

  it("matches on the requested slug even if the response slug differs", async () => {
    const { data, options, scope } = mountWithData("Basin");
    data.value = DETAIL_RESPONSE;
    await nextTick();

    expect(options.default()).toEqual(DETAIL_RESPONSE);
    scope.stop();
  });

  it("never serves one property's data for another slug", async () => {
    const slug = ref("basin");
    const { data, options, scope } = mountWithData(slug);
    data.value = DETAIL_RESPONSE;
    await nextTick();

    slug.value = "markpost";
    expect(options.default()).toBeUndefined();

    // Only one slug is remembered, so returning to basin has no stale data.
    data.value = { ...DETAIL_RESPONSE, slug: "markpost" };
    await nextTick();
    slug.value = "basin";
    expect(options.default()).toBeUndefined();
    scope.stop();
  });
});

describe("useApp polling", () => {
  let scope: ReturnType<typeof effectScope>;

  beforeEach(() => {
    vi.useFakeTimers();
    scope = effectScope();
  });

  afterEach(() => {
    scope.stop();
    vi.useRealTimers();
  });

  it("re-runs refresh on the shared interval", async () => {
    const refresh = vi.fn();
    vi.stubGlobal("useFetch", () => ({
      data: ref(null),
      pending: ref(false),
      error: ref(null),
      refresh,
    }));
    scope.run(() => useApp("basin"));

    await vi.advanceTimersByTimeAsync(DATA_REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh while the slug is empty", async () => {
    const refresh = vi.fn();
    vi.stubGlobal("useFetch", () => ({
      data: ref(null),
      pending: ref(false),
      error: ref(null),
      refresh,
    }));
    scope.run(() => useApp(""));

    await vi.advanceTimersByTimeAsync(DATA_REFRESH_INTERVAL_MS);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("starts refreshing once a reactive slug becomes non-empty", async () => {
    const refresh = vi.fn();
    vi.stubGlobal("useFetch", () => ({
      data: ref(null),
      pending: ref(false),
      error: ref(null),
      refresh,
    }));
    const slug = ref("");
    scope.run(() => useApp(slug));

    await vi.advanceTimersByTimeAsync(DATA_REFRESH_INTERVAL_MS);
    expect(refresh).not.toHaveBeenCalled();

    slug.value = "basin";
    await vi.advanceTimersByTimeAsync(DATA_REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
