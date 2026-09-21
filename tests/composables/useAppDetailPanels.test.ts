import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useAppDetailPanels } from "../../app/composables/useAppDetailPanels";
import { appDetailFixture } from "../support/appDetailFixture";

describe("useAppDetailPanels", () => {
  it("returns empty panel data when the detail getter has nothing yet", () => {
    const { trafficPanelData, sourceChips } = useAppDetailPanels(() => null);
    expect(trafficPanelData.value).toEqual({
      stats: [],
      delta: "—",
      path: "",
      axisLabels: [],
      lists: [],
    });
    expect(sourceChips.value).toEqual([]);
  });

  it("reacts when the underlying detail changes — a real refresh, not a stale snapshot", () => {
    const detail = ref(appDetailFixture());
    const { sourceChips } = useAppDetailPanels(() => detail.value);
    expect(sourceChips.value).toEqual([]);

    detail.value = appDetailFixture({
      sources: [
        {
          vendor: "ga4",
          ok: true,
          lastRunAt: null,
          lastSuccessAt: "2026-09-19T00:00:00.000Z",
          error: null,
        },
      ],
    });

    expect(sourceChips.value).toEqual([
      { label: "GA4 · 19 SEP 2026", tone: "ok" },
    ]);
  });
});
