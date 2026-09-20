import { describe, expect, it } from "vitest";
import { healthToneColor } from "../../app/utils/statusColor";
import type { HealthTone } from "../../shared/types/dashboard";

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
