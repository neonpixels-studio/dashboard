import type { HealthTone, IntegrationHealth } from "#shared/types/dashboard";

// Single source of truth for rendering a `HealthTone` (from `AppStatus`/
// `IntegrationHealth`) as a design-token color. Shared by every widget that
// shows a status/health chip (PropertyCard, AppHeaderBand, and the wiring
// issues' integration chips) so the tone → color mapping never drifts.
const HEALTH_TONE_COLORS: Record<HealthTone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--err)",
  muted: "var(--ink-3)",
};

// A tone this module doesn't know about would otherwise render
// `color-mix(in srgb, undefined 15%, transparent)` — an invalid, silently
// dropped declaration. Fall back to the same neutral ink used elsewhere
// rather than let that happen.
const FALLBACK_COLOR = "var(--ink-3)";

export function healthToneColor(tone: HealthTone): string {
  return HEALTH_TONE_COLORS[tone] ?? FALLBACK_COLOR;
}

// The chip color + tinted background pairing used by every status/health
// chip. Centralized so a widget never has to call `healthToneColor` twice to
// build one style object.
export function healthToneChipStyle(tone: HealthTone): {
  color: string;
  background: string;
} {
  const color = healthToneColor(tone);
  return { color, background: `color-mix(in srgb, ${color} 15%, transparent)` };
}

// An integration can be in four states, not two: actively healthy, actively
// failing, disabled by the operator, or enabled but never yet synced. Each
// gets its own tone so a card never shows "fine" for a state it doesn't
// actually know.
export function integrationHealthTone(
  integration: Pick<IntegrationHealth, "enabled" | "ok">,
): HealthTone {
  if (!integration.enabled) {
    return "muted";
  }
  if (integration.ok === false) {
    return "danger";
  }
  if (integration.ok === null) {
    return "warn";
  }
  return "ok";
}
