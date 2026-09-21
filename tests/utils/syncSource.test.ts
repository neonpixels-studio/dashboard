import { describe, expect, it } from "vitest";
import { buildSourceChips } from "../../app/utils/syncSource";
import type { SyncSource } from "../../shared/types/dashboard";

function source(overrides: Partial<SyncSource> = {}): SyncSource {
  return {
    vendor: "ga4",
    ok: true,
    lastRunAt: null,
    lastSuccessAt: null,
    error: null,
    ...overrides,
  };
}

describe("buildSourceChips", () => {
  it("returns one chip per source, uppercasing the vendor", () => {
    const chips = buildSourceChips([source({ vendor: "stripe" })]);
    expect(chips[0]!.label.startsWith("STRIPE")).toBe(true);
  });

  it("tones a healthy source ok and a failing one warn", () => {
    const chips = buildSourceChips([
      source({ vendor: "ga4", ok: true }),
      source({ vendor: "zyvop", ok: false }),
    ]);
    expect(chips[0]!.tone).toBe("ok");
    expect(chips[1]!.tone).toBe("warn");
  });

  it("labels a source with a real success timestamp using an absolute date", () => {
    const chips = buildSourceChips([
      source({ vendor: "ga4", lastSuccessAt: "2026-09-19T00:00:00.000Z" }),
    ]);
    expect(chips[0]!.label).toBe("GA4 · 19 SEP 2026");
  });

  it("labels a source with no successful sync yet, never a fabricated timestamp", () => {
    const chips = buildSourceChips([
      source({ vendor: "sentry", lastSuccessAt: null }),
    ]);
    expect(chips[0]!.label).toBe("SENTRY · never synced");
  });
});
