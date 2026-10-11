import { describe, expect, it } from "vitest";
import { deployStatusForState } from "../../shared/utils/deployStatus";

describe("deployStatusForState", () => {
  it("treats ready as success", () => {
    expect(deployStatusForState("ready")).toBe("success");
  });

  it("treats error as failed", () => {
    expect(deployStatusForState("error")).toBe("failed");
  });

  it.each([
    "new",
    "pending_review",
    "enqueued",
    "building",
    "uploading",
    "uploaded",
    "preparing",
    "prepared",
    "processing",
    "processed",
    "retrying",
    "some-future-state",
  ])("treats %s as in progress", (state) => {
    expect(deployStatusForState(state)).toBe("in_progress");
  });
});
