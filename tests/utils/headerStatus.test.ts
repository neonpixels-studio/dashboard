import { describe, expect, it } from "vitest";
import {
  resolveHeaderStatus,
  UNAVAILABLE_STATUS,
} from "../../app/utils/headerStatus";
import type { AppStatus } from "../../shared/types/dashboard";

const liveStatus: AppStatus = { label: "LIVE", tone: "ok" };

describe("resolveHeaderStatus", () => {
  it("maps a failed fetch with no data to the UNAVAILABLE chip", () => {
    expect(resolveHeaderStatus(null, new Error("boom"))).toEqual({
      label: "UNAVAILABLE",
      tone: "danger",
    });
    expect(resolveHeaderStatus(undefined, new Error("boom"))).toBe(
      UNAVAILABLE_STATUS,
    );
  });

  it("stays null while loading so the skeleton shows", () => {
    expect(resolveHeaderStatus(null, null)).toBeNull();
    expect(resolveHeaderStatus(undefined, undefined)).toBeNull();
  });

  it("keeps the last known status when a refresh fails", () => {
    expect(resolveHeaderStatus(liveStatus, new Error("boom"))).toBe(liveStatus);
  });

  it("returns the status when there is no error", () => {
    expect(resolveHeaderStatus(liveStatus, null)).toBe(liveStatus);
  });
});
