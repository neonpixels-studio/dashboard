import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

vi.stubGlobal("useFetch", vi.fn());
const { useOverviewDatabase } =
  await import("../../app/composables/useOverviewDatabase");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useOverviewDatabase", () => {
  it("calls useFetch against /api/overview/database with a stable key and returns its refs", () => {
    const refresh = vi.fn();
    const data = ref(null);
    const mockUseFetch = vi.fn(() => ({
      data,
      pending: ref(false),
      error: ref(null),
      refresh,
    }));
    vi.stubGlobal("useFetch", mockUseFetch);

    const database = useOverviewDatabase();

    expect(mockUseFetch).toHaveBeenCalledWith("/api/overview/database", {
      key: "overview-database",
      default: expect.any(Function),
    });
    expect(database.data).toBe(data);
    expect(database.refresh).toBe(refresh);
  });
});
