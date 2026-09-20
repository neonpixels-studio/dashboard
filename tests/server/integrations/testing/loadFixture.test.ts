import { describe, expect, it } from "vitest";
import { loadFixture } from "../../../../server/integrations/testing/loadFixture";

describe("loadFixture", () => {
  it("loads and parses a recorded fixture", async () => {
    const fixture = await loadFixture<{ metrics: unknown[] }>("mock", "empty");

    expect(fixture.metrics).toEqual([]);
  });

  it("rejects a vendor segment that looks like a path traversal attempt", async () => {
    await expect(loadFixture("../../etc", "empty")).rejects.toThrow(
      /Invalid fixture/,
    );
  });

  it("rejects a fixture name that looks like a path traversal attempt", async () => {
    await expect(loadFixture("mock", "../secrets")).rejects.toThrow(
      /Invalid fixture/,
    );
  });

  it("wraps a missing-fixture error with a read-specific message", async () => {
    await expect(loadFixture("mock", "does-not-exist")).rejects.toThrow(
      /Failed to read fixture/,
    );
  });
});
