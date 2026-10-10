import { describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";

const mockGetQuery = vi.fn();
vi.mock("h3", () => ({ getQuery: mockGetQuery }));

const { readOverviewRange } =
  await import("../../../server/utils/overviewRange");

describe("readOverviewRange", () => {
  it("returns the validated range from the query string", () => {
    mockGetQuery.mockReturnValue({ range: "60" });
    expect(readOverviewRange({} as H3Event)).toBe(60);
  });

  it("falls back to 30 for a missing or invalid range", () => {
    mockGetQuery.mockReturnValue({});
    expect(readOverviewRange({} as H3Event)).toBe(30);
    mockGetQuery.mockReturnValue({ range: "1; DROP TABLE" });
    expect(readOverviewRange({} as H3Event)).toBe(30);
  });
});
