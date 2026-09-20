import type { HealthTone } from "#shared/types/dashboard";

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

export function healthToneColor(tone: HealthTone): string {
  return HEALTH_TONE_COLORS[tone];
}
