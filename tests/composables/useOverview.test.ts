import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { OverviewResponse } from "../../shared/types/dashboard";

vi.stubGlobal("useFetch", vi.fn());
const { useOverview } = await import("../../app/composables/useOverview");

const OVERVIEW_RESPONSE: OverviewResponse = {
  mrr: {
    value: 1284,
    period: "current",
    capturedAt: null,
    delta: { value: 97, pct: 8.2 },
    byApp: [],
    series: [],
  },
  activeSubscribers: {
    value: 312,
    period: "current",
    capturedAt: null,
    delta: { value: 14, pct: 4.7 },
    byApp: [],
  },
  sessions30d: {
    value: 48200,
    period: "30d",
    capturedAt: null,
    delta: { value: 1449, pct: 3.1 },
    bySource: [],
  },
  openIssues: {
    value: 7,
    period: "current",
    capturedAt: null,
    delta: { value: 2, pct: 40 },
    byApp: [],
  },
  lastSyncedAt: "2026-09-20T11:56:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useOverview", () => {
  it("calls useFetch against /api/overview with a stable key", () => {
    const mockUseFetch = vi.fn(() => ({
      data: ref(OVERVIEW_RESPONSE),
      pending: ref(false),
      error: ref(null),
      refresh: vi.fn(),
    }));
    vi.stubGlobal("useFetch", mockUseFetch);

    useOverview();

    expect(mockUseFetch).toHaveBeenCalledWith("/api/overview", {
      key: "overview",
    });
  });

  it("returns typed data, pending, error, and refresh", () => {
    const refresh = vi.fn();
    vi.stubGlobal("useFetch", () => ({
      data: ref(OVERVIEW_RESPONSE),
      pending: ref(false),
      error: ref(null),
      refresh,
    }));

    const overview = useOverview();

    expect(overview.data.value).toEqual(OVERVIEW_RESPONSE);
    expect(overview.pending.value).toBe(false);
    expect(overview.error.value).toBeNull();
    expect(overview.refresh).toBe(refresh);
  });

  it("surfaces a fetch error without throwing", () => {
    const fetchError = new Error("network down");
    vi.stubGlobal("useFetch", () => ({
      data: ref(null),
      pending: ref(false),
      error: ref(fetchError),
      refresh: vi.fn(),
    }));

    const overview = useOverview();

    expect(overview.error.value).toBe(fetchError);
    expect(overview.data.value).toBeNull();
  });
});
