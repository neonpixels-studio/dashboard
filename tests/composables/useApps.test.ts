import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { DATA_REFRESH_INTERVAL_MS } from "../../app/composables/usePollingRefresh";
import type { AppsResponse } from "../../shared/types/dashboard";

vi.stubGlobal("useFetch", vi.fn());
const { useApps } = await import("../../app/composables/useApps");

const APPS_RESPONSE: AppsResponse = [
  {
    slug: "basin",
    status: { label: "LIVE", tone: "ok" },
    metrics: [],
    sparklines: [],
    integrations: [],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useApps", () => {
  it("calls useFetch against /api/apps with a stable key", () => {
    const mockUseFetch = vi.fn(() => ({
      data: ref(APPS_RESPONSE),
      pending: ref(false),
      error: ref(null),
      refresh: vi.fn(),
    }));
    vi.stubGlobal("useFetch", mockUseFetch);

    useApps();

    expect(mockUseFetch).toHaveBeenCalledWith("/api/apps", { key: "apps" });
  });

  it("returns typed data, pending, error, and refresh", () => {
    const refresh = vi.fn();
    vi.stubGlobal("useFetch", () => ({
      data: ref(APPS_RESPONSE),
      pending: ref(true),
      error: ref(null),
      refresh,
    }));

    const apps = useApps();

    expect(apps.data.value).toEqual(APPS_RESPONSE);
    expect(apps.pending.value).toBe(true);
    expect(apps.error.value).toBeNull();
    expect(apps.refresh).toBe(refresh);
  });
});

describe("useApps polling", () => {
  it("re-runs refresh on the shared interval", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    vi.stubGlobal("useFetch", () => ({
      data: ref(null),
      pending: ref(false),
      error: ref(null),
      refresh,
    }));
    const scope = effectScope();
    scope.run(() => useApps());

    await vi.advanceTimersByTimeAsync(DATA_REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    scope.stop();
    vi.useRealTimers();
  });
});
