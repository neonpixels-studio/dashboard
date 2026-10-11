import { describe, expect, it } from "vitest";
import { toNetlifyDeploy } from "../../../../server/integrations/netlify/mapping";

describe("toNetlifyDeploy", () => {
  it("uses published_at as the finish time for a ready deploy", () => {
    expect(
      toNetlifyDeploy({
        id: "d1",
        state: "ready",
        published_at: "2026-10-10T12:00:00Z",
        updated_at: "2026-10-10T13:00:00Z",
      }),
    ).toEqual({
      id: "d1",
      state: "ready",
      finishedAt: new Date("2026-10-10T12:00:00Z"),
    });
  });

  it("falls back to updated_at for a failed deploy that never published", () => {
    expect(
      toNetlifyDeploy({
        id: "d2",
        state: "error",
        published_at: null,
        updated_at: "2026-10-10T13:00:00Z",
      }).finishedAt,
    ).toEqual(new Date("2026-10-10T13:00:00Z"));
  });

  it("has no finish time while still building, even if updated_at is set", () => {
    expect(
      toNetlifyDeploy({
        id: "d3",
        state: "building",
        updated_at: "2026-10-10T13:00:00Z",
      }).finishedAt,
    ).toBeNull();
  });

  it("has no finish time when the timestamps are unparseable", () => {
    expect(
      toNetlifyDeploy({ id: "d4", state: "error", updated_at: "garbage" })
        .finishedAt,
    ).toBeNull();
  });

  it.each([
    [null],
    [{}],
    [{ id: "x" }],
    [{ state: "ready" }],
    [{ id: 1, state: "ready" }],
  ])("throws on a malformed deploy %j", (raw) => {
    expect(() => toNetlifyDeploy(raw)).toThrow(/missing a string id or state/);
  });
});
