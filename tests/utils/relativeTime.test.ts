import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "../../app/utils/relativeTime";

const NOW = new Date("2026-09-20T12:00:00.000Z");

describe("formatRelativeTime", () => {
  it("reports never synced for a null timestamp", () => {
    expect(formatRelativeTime(null, NOW)).toBe("never synced");
  });

  it("reports just now for a timestamp under a minute old", () => {
    expect(formatRelativeTime("2026-09-20T11:59:40.000Z", NOW)).toBe(
      "just now",
    );
  });

  it("reports minutes ago under an hour old", () => {
    expect(formatRelativeTime("2026-09-20T11:56:00.000Z", NOW)).toBe("4m ago");
  });

  it("reports hours ago under a day old", () => {
    expect(formatRelativeTime("2026-09-20T09:00:00.000Z", NOW)).toBe("3h ago");
  });

  it("reports days ago beyond a day old", () => {
    expect(formatRelativeTime("2026-09-17T12:00:00.000Z", NOW)).toBe("3d ago");
  });

  it("treats a future timestamp as just now rather than a negative duration", () => {
    expect(formatRelativeTime("2026-09-20T12:05:00.000Z", NOW)).toBe(
      "just now",
    );
  });

  it("reports sync time unknown for an unparseable timestamp, never a false just now", () => {
    expect(formatRelativeTime("not-a-real-timestamp", NOW)).toBe(
      "sync time unknown",
    );
  });
});
