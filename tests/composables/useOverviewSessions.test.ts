import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

vi.stubGlobal("useFetch", vi.fn());
const { useOverviewSessions } =
  await import("../../app/composables/useOverviewSessions");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useOverviewSessions", () => {
  it("calls useFetch against /api/overview/sessions with a stable key", () => {
    const mockUseFetch = vi.fn(() => ({
      data: ref([]),
      pending: ref(false),
      error: ref(null),
      refresh: vi.fn(),
    }));
    vi.stubGlobal("useFetch", mockUseFetch);

    useOverviewSessions();

    expect(mockUseFetch).toHaveBeenCalledWith("/api/overview/sessions", {
      key: "overview-sessions",
    });
  });

  it("returns data, pending, error, and refresh", () => {
    const refresh = vi.fn();
    const fetchError = new Error("network down");
    vi.stubGlobal("useFetch", () => ({
      data: ref(null),
      pending: ref(false),
      error: ref(fetchError),
      refresh,
    }));

    const sessions = useOverviewSessions();

    expect(sessions.error.value).toBe(fetchError);
    expect(sessions.data.value).toBeNull();
    expect(sessions.refresh).toBe(refresh);
  });
});
