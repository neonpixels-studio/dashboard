import { describe, expect, it } from "vitest";
import {
  healthToneColor,
  healthToneChipStyle,
  integrationHealthTone,
} from "../../app/utils/statusColor";
import type {
  HealthTone,
  IntegrationHealth,
} from "../../shared/types/dashboard";

describe("healthToneColor", () => {
  it.each<[HealthTone, string]>([
    ["ok", "var(--ok)"],
    ["warn", "var(--warn)"],
    ["danger", "var(--err)"],
    ["muted", "var(--ink-3)"],
  ])("maps %s to %s", (tone, expected) => {
    expect(healthToneColor(tone)).toBe(expected);
  });
});

// Exercised directly (not just through a mounted component) because
// happy-dom silently drops `color-mix(...)` declarations it can't parse, so
// a component snapshot alone can't catch a typo or swapped argument here.
describe("healthToneChipStyle", () => {
  it.each<[HealthTone, string]>([
    ["ok", "var(--ok)"],
    ["warn", "var(--warn)"],
    ["danger", "var(--err)"],
    ["muted", "var(--ink-3)"],
  ])("pairs %s with a color and a tinted background", (tone, color) => {
    expect(healthToneChipStyle(tone)).toEqual({
      color,
      background: `color-mix(in srgb, ${color} 15%, transparent)`,
    });
  });
});

function integration(overrides: Partial<IntegrationHealth>): IntegrationHealth {
  return {
    vendor: "sentry",
    enabled: true,
    ok: true,
    lastRunAt: null,
    lastSuccessAt: null,
    error: null,
    ...overrides,
  };
}

describe("integrationHealthTone", () => {
  it("is ok when enabled and healthy", () => {
    expect(
      integrationHealthTone(integration({ enabled: true, ok: true })),
    ).toBe("ok");
  });

  it("is danger when enabled and failing", () => {
    expect(
      integrationHealthTone(integration({ enabled: true, ok: false })),
    ).toBe("danger");
  });

  it("is warn when enabled but never synced", () => {
    expect(
      integrationHealthTone(integration({ enabled: true, ok: null })),
    ).toBe("warn");
  });

  it("is muted when disabled, regardless of its last known ok value", () => {
    expect(
      integrationHealthTone(integration({ enabled: false, ok: true })),
    ).toBe("muted");
    expect(
      integrationHealthTone(integration({ enabled: false, ok: false })),
    ).toBe("muted");
  });
});
