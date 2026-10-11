import { describe, expect, it } from "vitest";
import { buildSyncAlerts } from "../../../server/utils/overviewAlerts";
import type { SyncAlertRow } from "../../../server/integrations/staleVendorAlert";

const NOW = new Date("2026-10-10T12:00:00Z");
const hoursAgo = (hours: number) =>
  new Date(NOW.getTime() - hours * 60 * 60 * 1_000);

function row(overrides: Partial<SyncAlertRow> = {}): SyncAlertRow {
  return {
    slug: "basin",
    vendor: "stripe",
    lastRunAt: hoursAgo(0.25),
    lastSuccessAt: hoursAgo(0.25),
    lastAttemptedAt: null,
    ok: true,
    error: null,
    ...overrides,
  };
}

describe("buildSyncAlerts", () => {
  it("returns nothing when every row is healthy", () => {
    expect(buildSyncAlerts([row(), row({ vendor: "ga4" })], NOW)).toEqual([]);
  });

  it("includes a failing row with its stored error, time, and property link", () => {
    const alerts = buildSyncAlerts(
      [
        row({
          ok: false,
          error: "stripe: 401 unauthorized",
          lastAttemptedAt: hoursAgo(1),
          lastSuccessAt: hoursAgo(2),
        }),
      ],
      NOW,
    );

    expect(alerts).toEqual([
      {
        id: "sync-failed:basin:stripe",
        slug: "basin",
        source: "stripe",
        message: "stripe: 401 unauthorized",
        occurredAt: hoursAgo(1).toISOString(),
        href: "/apps/basin",
      },
    ]);
  });

  it("falls back to lastRunAt and a generic message when the failure has no error or attempt time", () => {
    const [alert] = buildSyncAlerts(
      [row({ ok: false, error: null, lastSuccessAt: hoursAgo(1) })],
      NOW,
    );

    expect(alert!.message).toBe("Sync failed");
    expect(alert!.occurredAt).toBe(hoursAgo(0.25).toISOString());
  });

  it("ignores a never-run row (watermark only), which has ok=false by default", () => {
    const watermarkOnly = row({
      ok: false,
      lastRunAt: null,
      lastSuccessAt: null,
      lastAttemptedAt: hoursAgo(1),
    });

    expect(buildSyncAlerts([watermarkOnly], NOW)).toEqual([]);
  });

  it("includes a stale ok vendor with hours since last success", () => {
    const alerts = buildSyncAlerts(
      [row({ vendor: "ga4", lastSuccessAt: hoursAgo(8) })],
      NOW,
    );

    expect(alerts).toEqual([
      {
        id: "sync-stale:basin:ga4",
        slug: "basin",
        source: "ga4",
        message: "No successful sync in 8h",
        occurredAt: hoursAgo(8).toISOString(),
        href: "/apps/basin",
      },
    ]);
  });

  it("shows a vendor that is both failing and stale once, as the failing alert", () => {
    const alerts = buildSyncAlerts(
      [
        row({
          ok: false,
          error: "boom",
          lastSuccessAt: hoursAgo(9),
          lastAttemptedAt: hoursAgo(1),
        }),
      ],
      NOW,
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.id).toBe("sync-failed:basin:stripe");
  });

  it("keeps a stale alert for a different vendor on the same property as a failing one", () => {
    const alerts = buildSyncAlerts(
      [
        row({ ok: false, error: "boom" }),
        row({ vendor: "ga4", lastSuccessAt: hoursAgo(8) }),
      ],
      NOW,
    );

    expect(alerts.map((alert) => alert.id).sort()).toEqual([
      "sync-failed:basin:stripe",
      "sync-stale:basin:ga4",
    ]);
  });

  it("keeps same-vendor alerts on different properties separate", () => {
    const alerts = buildSyncAlerts(
      [
        row({ slug: "basin", ok: false, error: "a" }),
        row({ slug: "markpost", ok: false, error: "b" }),
      ],
      NOW,
    );

    expect(alerts.map((alert) => alert.slug).sort()).toEqual([
      "basin",
      "markpost",
    ]);
  });

  it("says so when a stale vendor has never succeeded", () => {
    const [alert] = buildSyncAlerts(
      [row({ vendor: "ga4", lastSuccessAt: null })],
      NOW,
    );

    expect(alert!.message).toBe("No successful sync yet");
  });

  it("orders newest first with untimed alerts last", () => {
    const alerts = buildSyncAlerts(
      [
        row({ vendor: "a", ok: false, lastAttemptedAt: hoursAgo(5) }),
        row({ vendor: "b", ok: false, lastAttemptedAt: hoursAgo(1) }),
        row({
          vendor: "c",
          ok: false,
          lastAttemptedAt: null,
          lastRunAt: hoursAgo(3),
        }),
        row({
          vendor: "untimed",
          lastRunAt: hoursAgo(0.1),
          lastSuccessAt: null,
        }),
      ],
      NOW,
    );

    expect(alerts.map((alert) => alert.source)).toEqual([
      "b",
      "c",
      "a",
      "untimed",
    ]);
  });
});
