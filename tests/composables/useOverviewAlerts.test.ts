import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

vi.stubGlobal("useFetch", vi.fn());
const { useOverviewAlerts } =
  await import("../../app/composables/useOverviewAlerts");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useOverviewAlerts", () => {
  it("calls useFetch against /api/overview/alerts with a stable key and returns its refs", () => {
    const refresh = vi.fn();
    const data = ref([]);
    const mockUseFetch = vi.fn(() => ({
      data,
      pending: ref(false),
      error: ref(null),
      refresh,
    }));
    vi.stubGlobal("useFetch", mockUseFetch);

    const alerts = useOverviewAlerts();

    expect(mockUseFetch).toHaveBeenCalledWith("/api/overview/alerts", {
      key: "overview-alerts",
    });
    expect(alerts.data).toBe(data);
    expect(alerts.refresh).toBe(refresh);
  });
});
