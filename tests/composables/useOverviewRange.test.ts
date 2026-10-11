import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { useOverviewRange } from "../../app/composables/useOverviewRange";

const route = reactive<{ query: Record<string, unknown> }>({ query: {} });
const replace = vi.fn();

beforeEach(() => {
  route.query = {};
  replace.mockReset();
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("useRouter", () => ({ replace }));
});

describe("useOverviewRange", () => {
  it("defaults to 30 with no query", () => {
    expect(useOverviewRange().range.value).toBe(30);
  });

  it("reads a valid range from the URL query, reactively", () => {
    const { range } = useOverviewRange();
    route.query = { range: "7" };
    expect(range.value).toBe(7);
  });

  it("falls back to 30 for an invalid range in the URL", () => {
    route.query = { range: "9000" };
    expect(useOverviewRange().range.value).toBe(30);
  });

  it("writes a non-default range to the query, keeping other params", () => {
    route.query = { foo: "bar" };
    useOverviewRange().setRange(60);
    expect(replace).toHaveBeenCalledWith({
      query: { foo: "bar", range: "60" },
    });
  });

  it("drops the param when the default range is chosen", () => {
    route.query = { range: "7", foo: "bar" };
    useOverviewRange().setRange(30);
    expect(replace).toHaveBeenCalledWith({ query: { foo: "bar" } });
  });
});
